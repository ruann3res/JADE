import * as vscode from 'vscode';
import type { AiStructuredFix } from '../../entities/aiSuggestion';
import { MAX_FIX_TEXT_LENGTH } from '../../entities/aiSuggestion';
import type { OllamaRuntimeConfig } from '../config/ollamaConfig.service';
import { ollamaChat, type OllamaChatMessage } from './ollama.service';

export type AiFixGenerationInput = {
	document: vscode.TextDocument;
	diagnostic: {
		message: string;
		line: number;
		detail?: string;
		code?: string;
	};
	ollamaConfig: OllamaRuntimeConfig;
};

export type AiFixGenerationResult = {
	fix?: AiStructuredFix;
	modelContent: string;
	rawResponse: string;
};

export class AiFixGenerationService {
	async generateFix(input: AiFixGenerationInput): Promise<AiFixGenerationResult> {
		const messages = buildFixGenerationMessages(input.document, input.diagnostic);
		const response = await ollamaChat(input.ollamaConfig.baseUrl, input.ollamaConfig.modelId, messages, {
			format: 'json',
			modelOptions: { temperature: 0.05, num_predict: 4096 },
			timeoutMs: input.ollamaConfig.timeoutMs,
		});

		return {
			fix: parseAiFixJson(response.content, input.document),
			modelContent: response.content,
			rawResponse: response.raw,
		};
	}
}

export function parseAiFixJson(text: string, document?: vscode.TextDocument): AiStructuredFix | undefined {
	const trimmed = text.trim();
	const start = trimmed.indexOf('{');
	const end = trimmed.lastIndexOf('}');
	if (start === -1 || end === -1 || end <= start) {
		return undefined;
	}

	try {
		const parsed = JSON.parse(trimmed.slice(start, end + 1)) as Record<string, unknown>;
		if (parsed.fixKind === 'none') {
			return undefined;
		}
		if (parsed.fixKind === 'replaceLine') {
			const line = parsed.line;
			const newLineText = parsed.newLineText;
			if (!isPositiveInteger(line) || typeof newLineText !== 'string' || newLineText.length > MAX_FIX_TEXT_LENGTH) {
				return undefined;
			}
			return { kind: 'replaceLine', line, newLineText };
		}
		if (parsed.fixKind === 'replaceRange') {
			const startLine = parsed.startLine;
			const startColumn = parsed.startColumn;
			const endLine = parsed.endLine;
			const endColumn = parsed.endColumn;
			const newText = parsed.newText;
			if (
				!isPositiveInteger(startLine) ||
				!isPositiveInteger(endLine) ||
				typeof newText !== 'string' ||
				newText.length > MAX_FIX_TEXT_LENGTH ||
				startLine > endLine
			) {
				return undefined;
			}

			if (!isPositiveInteger(startColumn) || !isPositiveInteger(endColumn)) {
				const lineRange = document ? wholeLineRange(document, startLine, endLine) : undefined;
				if (!lineRange) {
					return undefined;
				}
				return {
					kind: 'replaceRange',
					startLine,
					startColumn: lineRange.startColumn,
					endLine,
					endColumn: lineRange.endColumn,
					newText: normalizeWholeLineReplacement(newText),
				};
			}

			if (startLine === endLine && startColumn > endColumn) {
				return undefined;
			}

			return {
				kind: 'replaceRange',
				startLine,
				startColumn,
				endLine,
				endColumn,
				newText,
			};
		}
		return undefined;
	} catch {
		return undefined;
	}
}

function buildFixGenerationMessages(
	document: vscode.TextDocument,
	diagnostic: AiFixGenerationInput['diagnostic'],
): OllamaChatMessage[] {
	const numberedSource = document
		.getText()
		.split(/\r?\n/)
		.map((line, index) => `${index + 1}: ${line}`)
		.join('\n');
	const system = `You generate minimal safe Java patches for VS Code.
Return only one JSON object.
Allowed outputs:
{"fixKind":"replaceLine","line":1,"newLineText":"raw Java source line"}
{"fixKind":"replaceRange","startLine":1,"startColumn":1,"endLine":1,"endColumn":1,"newText":"raw Java source"}
{"fixKind":"none"}

Rules:
- Replacement text must be raw Java source only, not markdown and not prose.
- Do not output comment-only advice as a fix.
- Preserve indentation.
- Prefer replacing the smallest statement or block that actually fixes the diagnostic.
- Never replace a method/class/control declaration or brace with a comment.
- For empty catch blocks, replace the block with real handling such as rethrowing a contextual exception that preserves the original cause. Do not use printStackTrace() or placeholder comments.
- If the safe fix is unclear, return {"fixKind":"none"}.`;
	const user = `<diagnostic>
line=${diagnostic.line}
code=${diagnostic.code ?? ''}
message=${diagnostic.message}
detail=${diagnostic.detail ?? ''}
</diagnostic>

<fileName>${document.fileName}</fileName>
<code lineNumbers="absolute">
${numberedSource}
</code>`;

	return [
		{ role: 'system', content: system },
		{ role: 'user', content: user },
	];
}

function isPositiveInteger(value: unknown): value is number {
	return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

function wholeLineRange(
	document: vscode.TextDocument,
	startLine: number,
	endLine: number,
): { startColumn: number; endColumn: number } | undefined {
	const startLineIndex = startLine - 1;
	const endLineIndex = endLine - 1;
	if (startLineIndex < 0 || endLineIndex < 0 || startLineIndex >= document.lineCount || endLineIndex >= document.lineCount) {
		return undefined;
	}

	return {
		startColumn: 1,
		endColumn: document.lineAt(endLineIndex).text.length + 1,
	};
}

function normalizeWholeLineReplacement(text: string): string {
	return text.replace(/^\r?\n/, '').replace(/\r?\n$/, '');
}
