import * as vscode from 'vscode';
import type { AiStructuredFix } from '../../entities/aiSuggestion';
import { MAX_FIX_TEXT_LENGTH } from '../../entities/aiSuggestion';

export const JADE_AI_FIX_DATA_KEY = 'jadeAiFix';

type DiagnosticWithData = vscode.Diagnostic & { data?: Record<string, unknown> };

export function readJadeAiFix(diagnostic: vscode.Diagnostic): AiStructuredFix | undefined {
	const data = (diagnostic as DiagnosticWithData).data;
	if (!data || typeof data !== 'object' || Array.isArray(data)) {
		return undefined;
	}

	return parseJadeAiFix(data[JADE_AI_FIX_DATA_KEY]);
}

export function buildWorkspaceEdit(
	document: vscode.TextDocument,
	fix: AiStructuredFix,
): vscode.WorkspaceEdit | undefined {
	if (fix.kind === 'replaceLine') {
		return buildReplaceLineEdit(document, fix);
	}
	return buildReplaceRangeEdit(document, fix);
}

function buildReplaceLineEdit(
	document: vscode.TextDocument,
	fix: Extract<AiStructuredFix, { kind: 'replaceLine' }>,
): vscode.WorkspaceEdit | undefined {
	if (!isPositiveInteger(fix.line) || fix.newLineText.length > MAX_FIX_TEXT_LENGTH) {
		return undefined;
	}

	const lineIndex = fix.line - 1;
	if (lineIndex < 0 || lineIndex >= document.lineCount) {
		return undefined;
	}

	const originalLine = document.lineAt(lineIndex);
	if (!isSafeJavaLineReplacement(originalLine.text, fix.newLineText)) {
		return undefined;
	}

	const edit = new vscode.WorkspaceEdit();
	edit.replace(document.uri, originalLine.range, fix.newLineText);
	return edit;
}

function buildReplaceRangeEdit(
	document: vscode.TextDocument,
	fix: Extract<AiStructuredFix, { kind: 'replaceRange' }>,
): vscode.WorkspaceEdit | undefined {
	if (
		!isPositiveInteger(fix.startLine) ||
		!isPositiveInteger(fix.endLine) ||
		!isPositiveInteger(fix.startColumn) ||
		!isPositiveInteger(fix.endColumn) ||
		fix.newText.length > MAX_FIX_TEXT_LENGTH
	) {
		return undefined;
	}

	const start = positionFromOneBased(document, fix.startLine, fix.startColumn);
	const end = positionFromOneBased(document, fix.endLine, fix.endColumn);
	if (!start || !end || start.isAfter(end)) {
		return undefined;
	}

	if (!isSafeJavaRangeReplacement(document, start, end, fix.newText)) {
		return undefined;
	}

	const edit = new vscode.WorkspaceEdit();
	edit.replace(document.uri, new vscode.Range(start, end), fix.newText);
	return edit;
}

function positionFromOneBased(
	document: vscode.TextDocument,
	line: number,
	column: number,
): vscode.Position | undefined {
	const lineIndex = line - 1;
	const character = column - 1;
	if (lineIndex < 0 || lineIndex >= document.lineCount || character < 0) {
		return undefined;
	}

	const textLine = document.lineAt(lineIndex);
	if (character > textLine.text.length) {
		return undefined;
	}

	return new vscode.Position(lineIndex, character);
}

function isSafeJavaLineReplacement(originalText: string, replacementText: string): boolean {
	const original = originalText.trim();
	const replacement = replacementText.trim();

	if (replacement.length === 0 || hasPlaceholderFixText(replacement)) {
		return false;
	}

	if (!isJavaStructuralLine(original)) {
		return true;
	}

	if (isCommentOnlyLine(replacement)) {
		return false;
	}

	return braceDelta(original) === braceDelta(replacement);
}

function isSafeJavaRangeReplacement(
	document: vscode.TextDocument,
	start: vscode.Position,
	end: vscode.Position,
	replacementText: string,
): boolean {
	const replacement = replacementText.trim();
	if (replacement.length === 0 || hasPlaceholderFixText(replacement)) {
		return false;
	}

	const originalText = rangeText(document, start, end);
	if (originalText === undefined) {
		return false;
	}

	if (cutsStructuralLineIndentation(document, start) || cutsStructuralLineIndentation(document, end)) {
		return false;
	}

	const original = originalText.trim();
	if (/^\}\s*(?:catch|else|finally)\b/.test(original) && /^(?:catch|else|finally)\b/.test(replacement)) {
		return false;
	}

	if (hasJavaStructuralContent(original) || hasJavaStructuralContent(replacement)) {
		return braceDelta(original) === braceDelta(replacement);
	}

	return true;
}

function rangeText(document: vscode.TextDocument, start: vscode.Position, end: vscode.Position): string | undefined {
	if (start.line === end.line) {
		const line = document.lineAt(start.line).text;
		return line.slice(start.character, end.character);
	}

	const lines: string[] = [];
	for (let lineIndex = start.line; lineIndex <= end.line; lineIndex++) {
		const line = document.lineAt(lineIndex).text;
		if (lineIndex === start.line) {
			lines.push(line.slice(start.character));
		} else if (lineIndex === end.line) {
			lines.push(line.slice(0, end.character));
		} else {
			lines.push(line);
		}
	}
	return lines.join('\n');
}

function cutsStructuralLineIndentation(document: vscode.TextDocument, position: vscode.Position): boolean {
	const line = document.lineAt(position.line).text;
	if (!isJavaStructuralLine(line.trim())) {
		return false;
	}

	const firstCodeCharacter = line.search(/\S|$/);
	return position.character > 0 && position.character < firstCodeCharacter;
}

function hasPlaceholderFixText(text: string): boolean {
	const normalized = text.toLowerCase();
	return (
		normalized.includes('handle the exception') ||
		normalized.includes('handle exception') ||
		normalized.includes('todo') ||
		normalized.includes('fixme') ||
		normalized.includes('printstacktrace()')
	);
}

function hasJavaStructuralContent(text: string): boolean {
	return text
		.split(/\r?\n/)
		.some((line) => isJavaStructuralLine(line.trim()));
}

function isJavaStructuralLine(text: string): boolean {
	return (
		text.includes('{') ||
		text.includes('}') ||
		/^(?:public|private|protected|static|final|abstract|synchronized|native|strictfp)\b/.test(text) ||
		/^(?:if|else|for|while|switch|try|catch|finally|do)\b/.test(text)
	);
}

function isCommentOnlyLine(text: string): boolean {
	return text.startsWith('//') || text.startsWith('/*') || text.startsWith('*');
}

function braceDelta(text: string): number {
	return countOccurrences(text, '{') - countOccurrences(text, '}');
}

function countOccurrences(text: string, char: string): number {
	let count = 0;
	for (const current of text) {
		if (current === char) {
			count += 1;
		}
	}
	return count;
}

function parseJadeAiFix(value: unknown): AiStructuredFix | undefined {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return undefined;
	}

	const raw = value as Record<string, unknown>;
	if (raw.kind === 'replaceLine') {
		if (!isPositiveInteger(raw.line) || typeof raw.newLineText !== 'string') {
			return undefined;
		}
		if (raw.newLineText.length > MAX_FIX_TEXT_LENGTH) {
			return undefined;
		}
		return { kind: 'replaceLine', line: raw.line, newLineText: raw.newLineText };
	}

	if (raw.kind === 'replaceRange') {
		if (
			!isPositiveInteger(raw.startLine) ||
			!isPositiveInteger(raw.startColumn) ||
			!isPositiveInteger(raw.endLine) ||
			!isPositiveInteger(raw.endColumn) ||
			typeof raw.newText !== 'string'
		) {
			return undefined;
		}
		if (raw.newText.length > MAX_FIX_TEXT_LENGTH) {
			return undefined;
		}
		return {
			kind: 'replaceRange',
			startLine: raw.startLine,
			startColumn: raw.startColumn,
			endLine: raw.endLine,
			endColumn: raw.endColumn,
			newText: raw.newText,
		};
	}

	return undefined;
}

function isPositiveInteger(value: unknown): value is number {
	return typeof value === 'number' && Number.isInteger(value) && value > 0;
}
