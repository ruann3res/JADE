import type { AiSuggestionParsed } from '../../entities/aiSuggestion';
import { RagContextService } from '../rag';
import {
	buildJavaAnalysisChatMessages,
	parseAiSuggestionsJson,
} from './promptBuilder.service';
import { ollamaChat, type OllamaChatMessage, type OllamaChatRequestOptions } from './ollama.service';

export type AiBatchStats = {
	batchNumber: number;
	totalBatches: number;
	alertCount: number;
	parsedCount: number;
	userCharLength: number;
	lineStart: number;
	lineEnd: number;
	error?: string;
	ragRetrievedIds?: string[];
	ragTruncated?: boolean;
	ragRetrieverName?: string;
	/** Present when the batch returned a JSON object with a `suggestions` key (array). */
	structuredJsonEnvelope?: boolean;
};

export type AiBatchPromptDebug = {
	systemRole: string;
	systemCharLength: number;
	firstUserCharLength: number;
	totalUserCharLength: number;
	maxUserCharLength: number;
	systemFirstLine: string;
	containsRoleTag: boolean;
};

export type AiBatchAnalysisResult = {
	suggestions: AiSuggestionParsed[];
	body: string;
	batchStats: AiBatchStats[];
	promptDebug: AiBatchPromptDebug;
};

type ChatRunner = (
	baseUrl: string,
	modelId: string,
	messages: OllamaChatMessage[],
) => Promise<{ content: string }>;

export const DEFAULT_AI_BATCH_MAX_LINES = 180;
export const DEFAULT_AI_BATCH_OVERLAP_LINES = 20;

export type AiBatchingOptions = {
	maxLines?: number;
	overlapLines?: number;
};

type JavaSourceBatch = {
	source: string;
	lineStart: number;
	lineEnd: number;
	totalLines: number;
};

const EMPTY_PROMPT_DEBUG: AiBatchPromptDebug = {
	systemRole: '(missing)',
	systemCharLength: 0,
	firstUserCharLength: 0,
	totalUserCharLength: 0,
	maxUserCharLength: 0,
	systemFirstLine: '',
	containsRoleTag: false,
};

export async function runAiAnalysisInBatches(input: {
	baseUrl: string;
	modelId: string;
	fileName: string;
	javaSource: string;
	ragContextService?: RagContextService;
	onBatchStart?: (stats: Pick<AiBatchStats, 'batchNumber' | 'totalBatches' | 'alertCount'>) => void;
	chatRunner?: ChatRunner;
	ollamaRequestOptions?: Pick<OllamaChatRequestOptions, 'timeoutMs' | 'modelOptions'>;
	batching?: AiBatchingOptions;
}): Promise<AiBatchAnalysisResult> {
	const batches = createJavaSourceBatches(input.javaSource, input.batching);
	const totalBatches = batches.length;
	const suggestions: AiSuggestionParsed[] = [];
	const batchStats: AiBatchStats[] = [];
	const bodyParts: string[] = [];
	let promptDebug = EMPTY_PROMPT_DEBUG;
	const ragService = input.ragContextService ?? new RagContextService();
	const chat =
		input.chatRunner ??
		((base, modelId, messages) =>
			defaultChatRunner(base, modelId, messages, input.ollamaRequestOptions));

	for (const [index, batch] of batches.entries()) {
		const batchNumber = index + 1;
		input.onBatchStart?.({ batchNumber, totalBatches, alertCount: 0 });
		const rag = await ragService.buildFromSource(batch.source);
		const messages = buildJavaAnalysisChatMessages({
			fileName: input.fileName,
			javaSource: batch.source,
			ragContext: rag.text,
			lineStart: batch.lineStart,
			lineEnd: batch.lineEnd,
			totalLines: batch.totalLines,
			batchNumber,
			totalBatches,
		});
		promptDebug = mergePromptDebug(promptDebug, messages);

		try {
			const response = await chat(input.baseUrl, input.modelId, messages);
			const parsed = parseAiSuggestionsJson(response.content);
			const batchSuggestions = parsed.suggestions.map((suggestion) =>
				normalizeSuggestionLineForBatch(suggestion, batch),
			);
			suggestions.push(...batchSuggestions);
			batchStats.push({
				batchNumber,
				totalBatches,
				alertCount: 0,
				parsedCount: parsed.suggestions.length,
				structuredJsonEnvelope: parsed.structuredJsonEnvelope,
				userCharLength: messages[1]?.content.length ?? 0,
				lineStart: batch.lineStart,
				lineEnd: batch.lineEnd,
				ragRetrievedIds: [...rag.retrievedIds],
				ragTruncated: rag.truncated,
				ragRetrieverName: rag.retrieverName,
			});
			bodyParts.push(formatBatchBody(batchNumber, totalBatches, response.content));
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			batchStats.push({
				batchNumber,
				totalBatches,
				alertCount: 0,
				parsedCount: 0,
				userCharLength: messages[1]?.content.length ?? 0,
				lineStart: batch.lineStart,
				lineEnd: batch.lineEnd,
				ragRetrievedIds: [...rag.retrievedIds],
				ragTruncated: rag.truncated,
				ragRetrieverName: rag.retrieverName,
				error: message,
			});
			bodyParts.push(formatBatchBody(batchNumber, totalBatches, `Ollama error: ${message}`));
		}
	}

	return {
		suggestions,
		body: bodyParts.join('\n\n'),
		batchStats,
		promptDebug,
	};
}

export function createJavaSourceBatches(
	javaSource: string,
	options?: AiBatchingOptions,
): JavaSourceBatch[] {
	const lines = javaSource.split(/\r?\n/);
	const totalLines = lines.length;
	const maxLines = normalizePositiveInteger(options?.maxLines, DEFAULT_AI_BATCH_MAX_LINES);
	const overlapLines = Math.min(
		normalizeNonNegativeInteger(options?.overlapLines, DEFAULT_AI_BATCH_OVERLAP_LINES),
		Math.max(0, maxLines - 1),
	);
	const batches: JavaSourceBatch[] = [];
	let startIndex = 0;

	while (startIndex < totalLines) {
		const endExclusive = Math.min(totalLines, startIndex + maxLines);
		batches.push({
			source: lines.slice(startIndex, endExclusive).join('\n'),
			lineStart: startIndex + 1,
			lineEnd: endExclusive,
			totalLines,
		});

		if (endExclusive >= totalLines) {
			break;
		}

		startIndex = endExclusive - overlapLines;
	}

	return batches.length > 0 ? batches : [{ source: '', lineStart: 1, lineEnd: 1, totalLines: 1 }];
}

function normalizeSuggestionLineForBatch(
	suggestion: AiSuggestionParsed,
	batch: JavaSourceBatch,
): AiSuggestionParsed {
	if (suggestion.line === undefined) {
		return suggestion;
	}
	if (suggestion.line >= batch.lineStart && suggestion.line <= batch.lineEnd) {
		return suggestion;
	}

	const batchLineCount = batch.lineEnd - batch.lineStart + 1;
	if (batch.lineStart > 1 && suggestion.line >= 1 && suggestion.line <= batchLineCount) {
		return {
			...suggestion,
			line: batch.lineStart + suggestion.line - 1,
		};
	}

	return suggestion;
}

function normalizePositiveInteger(value: number | undefined, fallback: number): number {
	return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : fallback;
}

function normalizeNonNegativeInteger(value: number | undefined, fallback: number): number {
	return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : fallback;
}

function defaultChatRunner(
	baseUrl: string,
	modelId: string,
	messages: OllamaChatMessage[],
	extra?: Pick<OllamaChatRequestOptions, 'timeoutMs' | 'modelOptions'>,
): Promise<{ content: string }> {
	return ollamaChat(baseUrl, modelId, messages, {
		format: 'json',
		modelOptions: extra?.modelOptions ?? { temperature: 0.15, num_predict: 4096 },
		timeoutMs: extra?.timeoutMs,
	});
}

function mergePromptDebug(
	current: AiBatchPromptDebug,
	messages: OllamaChatMessage[],
): AiBatchPromptDebug {
	const systemMsg = messages[0];
	const userMsg = messages[1];
	const userCharLength = userMsg?.content.length ?? 0;
	const firstUserCharLength =
		current.firstUserCharLength > 0 ? current.firstUserCharLength : userCharLength;

	return {
		systemRole: current.systemRole !== '(missing)' ? current.systemRole : systemMsg?.role ?? '(missing)',
		systemCharLength: current.systemCharLength > 0 ? current.systemCharLength : systemMsg?.content.length ?? 0,
		firstUserCharLength,
		totalUserCharLength: current.totalUserCharLength + userCharLength,
		maxUserCharLength: Math.max(current.maxUserCharLength, userCharLength),
		systemFirstLine: current.systemFirstLine || (systemMsg?.content ?? '').split('\n')[0] || '',
		containsRoleTag: current.containsRoleTag || (systemMsg?.content ?? '').includes('<role>'),
	};
}

function formatBatchBody(batchNumber: number, totalBatches: number, content: string): string {
	return `--- AI Batch ${batchNumber}/${totalBatches} ---\n${content}`;
}
