import * as vscode from 'vscode';
import type { AiStructuredFix, AiSuggestionParsed } from '../../entities/aiSuggestion';
import type { FeedbackCategory } from '../../entities/feedback';

export const UDIA_AI_DIAGNOSTIC_SOURCE = 'UDIA AI';
export const MAX_AI_DIAGNOSTICS_PER_FILE = 25;

type DiagnosticWithData = vscode.Diagnostic & { data?: Record<string, unknown> };

export type AiDiagnosticSelectionResult = {
	suggestions: AiSuggestionParsed[];
	droppedByDuplicate: number;
	droppedByLimit: number;
};

export type AiDiagnosticMappingResult = AiDiagnosticSelectionResult & {
	diagnostics: vscode.Diagnostic[];
};

export function selectAiSuggestionsForDiagnostics(
	suggestions: readonly AiSuggestionParsed[],
	maxDiagnostics = MAX_AI_DIAGNOSTICS_PER_FILE,
): AiDiagnosticSelectionResult {
	const seenAiKeys = new Set<string>();
	const selected: AiSuggestionParsed[] = [];
	let droppedByDuplicate = 0;
	let droppedByLimit = 0;

	for (const suggestion of suggestions) {
		if (suggestion.line === undefined) {
			continue;
		}

		const key = `${suggestion.line}:${suggestion.category}`;
		if (seenAiKeys.has(key)) {
			droppedByDuplicate += 1;
			continue;
		}

		seenAiKeys.add(key);

		if (selected.length >= maxDiagnostics) {
			droppedByLimit += 1;
			continue;
		}

		selected.push(suggestion);
	}

	return {
		suggestions: selected,
		droppedByDuplicate,
		droppedByLimit,
	};
}

export class AiDiagnosticMapperService {
	map(
		document: vscode.TextDocument,
		suggestions: readonly AiSuggestionParsed[],
		maxDiagnostics = MAX_AI_DIAGNOSTICS_PER_FILE,
	): AiDiagnosticMappingResult {
		const selected = selectAiSuggestionsForDiagnostics(suggestions, maxDiagnostics);
		const diagnostics = selected.suggestions.map((suggestion) => {
			const range = rangeForSuggestionLine(document, suggestion.line ?? 1);
			const diagnostic = new vscode.Diagnostic(
				range,
				`[AI] ${suggestion.summary || suggestion.detail}`,
				aiDiagnosticSeverityForCategory(suggestion.category),
			);
			diagnostic.source = UDIA_AI_DIAGNOSTIC_SOURCE;
			diagnostic.code = `ai.${suggestion.category}`;
			diagnostic.relatedInformation = [
				new vscode.DiagnosticRelatedInformation(
					new vscode.Location(document.uri, range),
					`Detail: ${suggestion.detail || suggestion.summary}`,
				),
			];
			if (suggestion.fix) {
				setFixOnDiagnostic(diagnostic, suggestion.fix);
			}
			return diagnostic;
		});

		return {
			...selected,
			diagnostics,
		};
	}
}

function aiDiagnosticSeverityForCategory(category: FeedbackCategory): vscode.DiagnosticSeverity {
	switch (category) {
		case 'security':
		case 'bug':
			return vscode.DiagnosticSeverity.Warning;
		case 'duplication':
		case 'codeSmell':
			return vscode.DiagnosticSeverity.Information;
		default:
			return vscode.DiagnosticSeverity.Information;
	}
}

function rangeForSuggestionLine(document: vscode.TextDocument, line: number): vscode.Range {
	const lineIndex = Math.max(0, Math.min(document.lineCount - 1, line - 1));
	const textLine = document.lineAt(lineIndex);
	const firstNonWhitespace = textLine.firstNonWhitespaceCharacterIndex;
	const start = new vscode.Position(lineIndex, firstNonWhitespace);
	const end = textLine.range.end.isAfter(start) ? textLine.range.end : start;
	return new vscode.Range(start, end);
}

function setFixOnDiagnostic(diagnostic: vscode.Diagnostic, fix: AiStructuredFix): void {
	const target = diagnostic as DiagnosticWithData;
	const base = target.data && typeof target.data === 'object' && !Array.isArray(target.data) ? target.data : {};
	target.data = { ...base, udiaAiFix: fix };
}
