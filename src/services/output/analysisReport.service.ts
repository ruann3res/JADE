import * as vscode from 'vscode';
import type { OllamaRuntimeConfig } from '../config/ollamaConfig.service';
import type { AiBatchAnalysisResult, AiBatchPromptDebug, AiBatchStats } from '../ai/aiBatchAnalysis.service';
import type { AiDiagnosticMappingResult } from '../ai/aiDiagnosticMapper.service';
import type { AiSuggestionFilterResult } from '../ai/aiSuggestionFilter.service';
import { JAVA_ANALYSIS_PROMPT_LOG_LABEL } from '../ai/prompts/javaAnalysisPrompt';
import { udiaLogSection } from '../../outputChannel';

type PromptLoadDebug = AiBatchPromptDebug & {
	promptSource: string;
};

type ReportStats = {
	parsedCount: number;
	validLineCount: number;
	droppedInvalidLine: number;
	fileLineCount: number;
	panelRowCount: number;
	aiDiagnosticCount: number;
	aiDiagnosticDroppedDuplicate: number;
	aiDiagnosticDroppedLimit: number;
	batchStats: AiBatchStats[];
	structuredJsonEnvelope: boolean;
};

export class AnalysisReportService {
	render(input: {
		document: vscode.TextDocument;
		sonarText: string;
		sonarEnabled: boolean;
		batchResult: AiBatchAnalysisResult;
		filtered: AiSuggestionFilterResult;
		aiDiagnostic: AiDiagnosticMappingResult;
		ollamaConfig: OllamaRuntimeConfig;
		outputChannel: vscode.OutputChannel;
	}): void {
		const promptDebug: PromptLoadDebug = {
			promptSource: JAVA_ANALYSIS_PROMPT_LOG_LABEL,
			...input.batchResult.promptDebug,
		};
		this.renderOutput(
			input.document,
			input.sonarText,
			input.batchResult.body,
			input.ollamaConfig.modelId,
			input.outputChannel,
			{
				parsedCount: input.batchResult.suggestions.length,
				validLineCount: input.filtered.kept.length,
				droppedInvalidLine: input.filtered.droppedInvalidLine,
				fileLineCount: input.document.lineCount,
				panelRowCount: input.filtered.kept.length,
				aiDiagnosticCount: input.aiDiagnostic.diagnostics.length,
				aiDiagnosticDroppedDuplicate: input.aiDiagnostic.droppedByDuplicate,
				aiDiagnosticDroppedLimit: input.aiDiagnostic.droppedByLimit,
				batchStats: input.batchResult.batchStats,
				structuredJsonEnvelope: input.batchResult.batchStats.some((batch) => batch.structuredJsonEnvelope === true),
			},
			input.sonarEnabled,
			promptDebug,
			input.filtered.truncated,
		);
	}

	private renderOutput(
		document: vscode.TextDocument,
		sonarText: string,
		aiBody: string,
		modelId: string,
		outputChannel: vscode.OutputChannel,
		stats: ReportStats,
		sonarIntegrationOn: boolean,
		promptDebug: PromptLoadDebug,
		truncatedForUi: number,
	): void {
		const fileLabel = document.fileName.split(/[/\\]/).pop() ?? document.fileName;
		const sonarPreviewLimit = 25_000;
		const sonarPreview =
			sonarText.length > sonarPreviewLimit
				? `${sonarText.slice(0, sonarPreviewLimit)}\n... (truncated in Output; full text was sent to Ollama in the prompt.)`
				: sonarText;

		outputChannel.clear();
		udiaLogSection('UDIA REPORT');
		outputChannel.appendLine(`When: ${new Date().toISOString()}`);
		outputChannel.appendLine(`File: ${fileLabel}`);
		outputChannel.appendLine(`Ollama model: ${modelId}`);
		outputChannel.appendLine('');

		udiaLogSection('Overview');
		outputChannel.appendLine(
			`Sonar: ${sonarIntegrationOn ? 'API lookup enabled' : 'disabled'} (snippet below).`,
		);
		const iaOverview =
			stats.parsedCount === 0
				? stats.structuredJsonEnvelope
					? 'AI: valid JSON with an empty "suggestions" list or no usable items (0 findings for the panel). See the AI Response section.'
					: 'AI: response did not contain usable JSON (parse failed or unexpected format). See the AI Response section.'
				: `AI: ${stats.validLineCount} suggestion(s) with valid line numbers (1-${stats.fileLineCount}); parsed: ${stats.parsedCount}${stats.droppedInvalidLine > 0 ? `; ignored because line does not exist: ${stats.droppedInvalidLine}` : ''}.`;
		outputChannel.appendLine(iaOverview);
		outputChannel.appendLine(`Panel: ${stats.panelRowCount} AI item(s)${truncatedForUi > 0 ? `; truncated: ${truncatedForUi}` : ''}.`);
		outputChannel.appendLine(
			`AI diagnostics: ${stats.aiDiagnosticCount}; duplicates=${stats.aiDiagnosticDroppedDuplicate}, limit=${stats.aiDiagnosticDroppedLimit}.`,
		);
		outputChannel.appendLine(
			`AI batches: ${stats.batchStats.length} executed; failures=${stats.batchStats.filter((batch) => batch.error).length}.`,
		);

		udiaLogSection('Prompt Debug');
		outputChannel.appendLine(`System prompt source: ${promptDebug.promptSource}`);
		outputChannel.appendLine(
			`Message [0]: role=${promptDebug.systemRole}, size=${promptDebug.systemCharLength} chars`,
		);
		outputChannel.appendLine(`First system line: ${promptDebug.systemFirstLine}`);
		outputChannel.appendLine(`Contains <role>: ${promptDebug.containsRoleTag ? 'yes' : 'no'}`);
		outputChannel.appendLine(
			`User messages by batch: first=${promptDebug.firstUserCharLength} chars, largest=${promptDebug.maxUserCharLength} chars, total=${promptDebug.totalUserCharLength} chars`,
		);

		udiaLogSection('AI Batches');
		for (const batch of stats.batchStats) {
			const base = `Batch ${batch.batchNumber}/${batch.totalBatches}: lines=${batch.lineStart}-${batch.lineEnd}, alerts=${batch.alertCount}, parsed=${batch.parsedCount}, userChars=${batch.userCharLength}`;
			outputChannel.appendLine(batch.error ? `${base}, error=${batch.error}` : base);
		}

		udiaLogSection('Sonar Snippet');
		outputChannel.appendLine(sonarPreview);

		udiaLogSection('AI Response');
		outputChannel.appendLine(aiBody);
		outputChannel.show(true);
	}
}
