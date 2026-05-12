import type { FeedbackCategory } from './feedback';

export type AiStructuredFix =
	| { kind: 'replaceLine'; line: number; newLineText: string }
	| {
		kind: 'replaceRange';
		startLine: number;
		startColumn: number;
		endLine: number;
		endColumn: number;
		newText: string;
	};

export const MAX_FIX_TEXT_LENGTH = 500_000;

export type AiSuggestionParsed = {
	id: string;
	line?: number;
	category: FeedbackCategory;
	summary: string;
	detail: string;
	fix?: AiStructuredFix;
};
