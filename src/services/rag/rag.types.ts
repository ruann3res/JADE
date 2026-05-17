import type { FeedbackCategory } from '../../entities/feedback';

export type JavaHeuristic = {
	readonly id: string;
	readonly category: FeedbackCategory;
	readonly keywords: readonly string[];
	readonly patterns?: readonly RegExp[];
	readonly title: string;
	readonly guidance: string;
};

export type RagConfig = {
	readonly topK: number;
	readonly maxContextChars: number;
	readonly keywordScore: number;
	readonly patternScore: number;
	/** Minimum score for the lexical retriever (sum of keyword/pattern points). */
	readonly minScore: number;
	/**
	 * Minimum cosine similarity for the Qdrant retriever (range 0–1).
	 * Kept separate from `minScore` because the two retrievers use incompatible
	 * scoring scales — a single threshold would either drown the vector results
	 * or let too much noise through the lexical results.
	 */
	readonly vectorMinScore: number;
	readonly emptyContextMessage: string;
	readonly headerLine: string;
};

export type HeuristicMatch = {
	readonly heuristic: JavaHeuristic;
	readonly score: number;
	readonly matchedKeywords: readonly string[];
	readonly matchedPatternCount: number;
};

export interface HeuristicRetriever {
	retrieve(
		source: string,
		heuristics: readonly JavaHeuristic[],
		config: RagConfig,
	): Promise<HeuristicMatch[]>;

	/** Optional human-readable label used in logs (e.g. "qdrant", "lexical"). */
	readonly name?: string;
}

export type FormattedRagContext = {
	readonly text: string;
	readonly truncated: boolean;
};

export interface RagContextFormatter {
	format(matches: readonly HeuristicMatch[], config: RagConfig): FormattedRagContext;
}

export type RagContextResult = {
	readonly text: string;
	readonly retrievedIds: readonly string[];
	readonly truncated: boolean;
	readonly ragEnabled: true;
	/** Which retriever produced this context (e.g. "qdrant", "lexical"). */
	readonly retrieverName: string;
};
