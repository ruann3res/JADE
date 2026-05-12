import type { AiSuggestionParsed } from '../../entities/aiSuggestion';

export type AiSuggestionFilterResult = {
	kept: AiSuggestionParsed[];
	droppedInvalidLine: number;
	truncated: number;
};

export function filterAiSuggestionsByLineRange(
	suggestions: readonly AiSuggestionParsed[],
	lineCount: number,
): { kept: AiSuggestionParsed[]; dropped: number } {
	if (lineCount < 1) {
		return { kept: [], dropped: suggestions.length };
	}
	const kept = suggestions.filter(
		(suggestion) =>
			typeof suggestion.line === 'number' &&
			Number.isInteger(suggestion.line) &&
			suggestion.line >= 1 &&
			suggestion.line <= lineCount,
	);
	return { kept, dropped: suggestions.length - kept.length };
}

export class AiSuggestionFilterService {
	refine(suggestions: readonly AiSuggestionParsed[], lineCount: number): AiSuggestionFilterResult {
		const filtered = filterAiSuggestionsByLineRange(suggestions, lineCount);
		const kept = filtered.kept.slice(0, 25);
		return {
			kept,
			droppedInvalidLine: filtered.dropped,
			truncated: Math.max(0, filtered.kept.length - kept.length),
		};
	}
}
