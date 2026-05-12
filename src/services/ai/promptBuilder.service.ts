import type { AiStructuredFix, AiSuggestionParsed } from '../../entities/aiSuggestion';
import type { FeedbackCategory } from '../../entities/feedback';
import { getJavaAnalysisSystemInstructions } from './prompts/javaAnalysisPrompt';
import type { OllamaChatMessage } from './ollama.service';
import { MAX_FIX_TEXT_LENGTH } from '../../entities/aiSuggestion';

function wrapCdata(value: string): string {
	return `<![CDATA[${value.replace(/]]>/g, ']]]]><![CDATA[')}]]>`;
}

export function buildJavaAnalysisChatMessages(input: {
	fileName: string;
	javaSource: string;
	sonarContext: string;
	lineStart?: number;
	lineEnd?: number;
	totalLines?: number;
	batchNumber?: number;
	totalBatches?: number;
}): OllamaChatMessage[] {
	const system = getJavaAnalysisSystemInstructions();
	const source = numberJavaSourceLines(input.javaSource, input.lineStart ?? 1);
	const sonar = input.sonarContext || '(empty)';
	const lineStart = input.lineStart ?? 1;
	const lineEnd = input.lineEnd ?? lineStart + input.javaSource.split(/\r?\n/).length - 1;
	const totalLines = input.totalLines ?? lineEnd;
	const batchNumber = input.batchNumber ?? 1;
	const totalBatches = input.totalBatches ?? 1;
	const user = `<input>
<fileName>${wrapCdata(input.fileName)}</fileName>
<language>java</language>
<batch>${batchNumber}/${totalBatches}</batch>
<absoluteLineRange>${lineStart}-${lineEnd}</absoluteLineRange>
<totalFileLines>${totalLines}</totalFileLines>
<sonarContext>
${wrapCdata(sonar)}
</sonarContext>
<code lineNumbers="absolute">
${wrapCdata(source)}
</code>
</input>

Response: a single JSON object with exactly the "suggestions" key (array of items with id, line, category, summary, detail; optionally valid structured fix fields). Use only English in summary and detail. Use only a single existing integer within absoluteLineRange in "line", without quotes and without ranges. XML, markdown, code fences, and any text before or after the JSON are forbidden.`;
	return [
		{ role: 'system', content: system },
		{ role: 'user', content: user },
	];
}

function numberJavaSourceLines(source: string, firstLine: number): string {
	return source
		.split(/\r?\n/)
		.map((line, index) => `${firstLine + index}: ${line}`)
		.join('\n');
}

export function parseAiSuggestionsJson(text: string): {
	suggestions: AiSuggestionParsed[];
	/** `true` when the JSON envelope has a `suggestions` key (array, possibly empty). */
	structuredJsonEnvelope: boolean;
} {
	const trimmed = text.trim();
	const start = trimmed.indexOf('{');
	const end = trimmed.lastIndexOf('}');
	if (start === -1 || end === -1 || end <= start) {
		return { suggestions: [], structuredJsonEnvelope: false };
	}
	const slice = trimmed.slice(start, end + 1);
	try {
		const parsed = JSON.parse(slice) as { suggestions?: unknown };
		const hasSuggestionsKey =
			parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) && 'suggestions' in parsed;
		const raw = Array.isArray(parsed.suggestions) ? parsed.suggestions : [];
		const suggestions = raw
			.map((item, index) => {
				const suggestion = item as Record<string, unknown>;
				const id = normalizeSuggestionId(suggestion.id as string | number | undefined, index);
				const line = parseSuggestionLine(suggestion.line);
				const category = normalizeCategory(typeof suggestion.category === 'string' ? suggestion.category : undefined);
				const summary = typeof suggestion.summary === 'string' ? suggestion.summary : '';
				const detail = typeof suggestion.detail === 'string' ? suggestion.detail : summary;
				const fix = parseOptionalFixFromRaw(suggestion, line);
				return { id, line, category, summary, detail, ...(fix ? { fix } : {}) };
			})
			.filter((suggestion) => suggestion.summary.length > 0 || suggestion.detail.length > 0);
		return {
			suggestions,
			structuredJsonEnvelope: hasSuggestionsKey && Array.isArray(parsed.suggestions),
		};
	} catch {
		return { suggestions: [], structuredJsonEnvelope: false };
	}
}

function parseSuggestionLine(value: unknown): number | undefined {
	if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
		return value;
	}
	if (typeof value !== 'string') {
		return undefined;
	}
	const match = value.trim().match(/\d+/);
	if (!match) {
		return undefined;
	}
	const parsed = Number(match[0]);
	return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function parseOptionalFixFromRaw(
	raw: Record<string, unknown>,
	line: number | undefined,
): AiStructuredFix | undefined {
	if (raw.fixKind === 'replaceLine') {
		const newLineText = raw.newLineText;
		if (typeof newLineText !== 'string') {
			return undefined;
		}
		if (line === undefined || !Number.isInteger(line) || line < 1) {
			return undefined;
		}
		if (newLineText.length > MAX_FIX_TEXT_LENGTH) {
			return undefined;
		}
		return { kind: 'replaceLine', line, newLineText };
	}
	if (raw.fixKind === 'replaceRange') {
		const keys = ['startLine', 'startColumn', 'endLine', 'endColumn'] as const;
		const values: Record<(typeof keys)[number], number> = {} as Record<(typeof keys)[number], number>;
		for (const key of keys) {
			const value = raw[key];
			if (typeof value !== 'number' || !Number.isInteger(value)) {
				return undefined;
			}
			if ((key === 'startLine' || key === 'endLine') && value < 1) {
				return undefined;
			}
			if ((key === 'startColumn' || key === 'endColumn') && value < 0) {
				return undefined;
			}
			values[key] = value;
		}
		const newText = raw.newText;
		if (typeof newText !== 'string' || newText.length > MAX_FIX_TEXT_LENGTH) {
			return undefined;
		}
		const startColumn = values.startColumn <= 0 ? 1 : values.startColumn;
		const endColumn = values.endColumn <= 0 ? 1 : values.endColumn;
		if (values.startLine > values.endLine || (values.startLine === values.endLine && startColumn > endColumn)) {
			return undefined;
		}
		return {
			kind: 'replaceRange',
			startLine: values.startLine,
			startColumn,
			endLine: values.endLine,
			endColumn,
			newText,
		};
	}
	return undefined;
}

function normalizeSuggestionId(id: string | number | undefined, index: number): string {
	if (typeof id === 'string' && id.trim().length > 0) {
		return id.trim();
	}
	if (typeof id === 'number' && Number.isFinite(id)) {
		return `s${id}`;
	}
	return `s${index + 1}`;
}

function normalizeCategory(value: string | undefined): FeedbackCategory {
	const normalized = (value ?? '')
		.trim()
		.toLowerCase()
		.replace(/[\s_-]+/g, '');
	if (normalized === 'bug' || normalized === 'bugs' || normalized === 'errorhandling') {
		return 'bug';
	}
	if (normalized === 'security' || normalized === 'vulnerability' || normalized === 'vulnerabilities' || normalized === 'hotspot') {
		return 'security';
	}
	if (normalized === 'duplication' || normalized === 'duplicate' || normalized === 'duplicatedcode') {
		return 'duplication';
	}
	if (
		normalized === 'codesmell' ||
		normalized === 'maintainability' ||
		normalized === 'performance' ||
		normalized === 'reliability' ||
		normalized === 'style'
	) {
		return 'codeSmell';
	}
	if (value === 'bug' || value === 'security' || value === 'duplication' || value === 'codeSmell') {
		return value;
	}
	return 'codeSmell';
}
