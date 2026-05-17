import type { RagConfig } from '../rag.types';

export const DEFAULT_RAG_CONFIG: RagConfig = {
	topK: 4,
	maxContextChars: 2_500,
	keywordScore: 1,
	patternScore: 3,
	minScore: 1,
	/**
	 * Empirically, cosine similarity between an entire Java batch and a Sonar rule
	 * description from `nomic-embed-text` lives in the 0.3–0.7 band. 0.35 cuts the
	 * obvious noise while still surfacing the top few candidates the LLM can rerank.
	 */
	vectorMinScore: 0.35,
	emptyContextMessage:
		'Local Java heuristics (retrieval hints only): no strong lexical match for this batch. Rely on the analyzed code and general Java static analysis knowledge.',
	headerLine:
		'Local Java heuristics (retrieval hints only — not findings in this file). Treat as candidate categories; only report issues with concrete evidence in <code>.',
};
