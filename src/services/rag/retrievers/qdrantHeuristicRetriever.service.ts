import type { FeedbackCategory } from '../../../entities/feedback';
import type { EmbeddingClient } from '../clients/ollamaEmbedding.client';
import type { QdrantRulePayload, JadeQdrantClient } from '../clients/qdrant.client';
import type {
	HeuristicMatch,
	HeuristicRetriever,
	JavaHeuristic,
	RagConfig,
} from '../rag.types';

const VALID_CATEGORIES: ReadonlySet<FeedbackCategory> = new Set([
	'codeSmell',
	'bug',
	'security',
	'duplication',
]);

export type QdrantSearchDebug = {
	readonly hitCount: number;
	readonly kept: number;
	readonly topScore: number | null;
	readonly minScore: number;
	readonly topIds: readonly string[];
};

export type QdrantHeuristicRetrieverDependencies = {
	embeddingClient: EmbeddingClient;
	qdrant: JadeQdrantClient;
	/** Max characters of source sent to the embedder per batch. */
	maxEmbeddingChars?: number;
	/** Optional callback for diagnostics. Receives raw vs kept counts per query. */
	onSearchDebug?: (info: QdrantSearchDebug) => void;
};

export class QdrantHeuristicRetriever implements HeuristicRetriever {
	readonly name = 'qdrant';

	private readonly embeddingClient: EmbeddingClient;
	private readonly qdrant: JadeQdrantClient;
	private readonly maxEmbeddingChars: number;
	private readonly onSearchDebug?: (info: QdrantSearchDebug) => void;

	constructor(deps: QdrantHeuristicRetrieverDependencies) {
		this.embeddingClient = deps.embeddingClient;
		this.qdrant = deps.qdrant;
		this.maxEmbeddingChars = deps.maxEmbeddingChars ?? 8_000;
		this.onSearchDebug = deps.onSearchDebug;
	}

	async retrieve(
		source: string,
		_heuristics: readonly JavaHeuristic[],
		config: RagConfig,
	): Promise<HeuristicMatch[]> {
		const trimmedSource = source.slice(0, this.maxEmbeddingChars);
		if (trimmedSource.trim().length === 0) {
			return [];
		}

		const vector = await this.embeddingClient.embed(trimmedSource);
		const hits = await this.qdrant.search(vector, Math.max(1, config.topK));
		const threshold = config.vectorMinScore;
		const kept = hits.filter((hit) => hit.score >= threshold);

		this.onSearchDebug?.({
			hitCount: hits.length,
			kept: kept.length,
			topScore: hits.length > 0 ? hits[0].score : null,
			minScore: threshold,
			topIds: hits.slice(0, 5).map((hit) => `${hit.payload.id}(${hit.score.toFixed(2)})`),
		});

		return kept.map((hit) => toMatch(hit.payload, hit.score));
	}
}

function toMatch(payload: QdrantRulePayload, score: number): HeuristicMatch {
	const heuristic: JavaHeuristic = {
		id: payload.id,
		category: VALID_CATEGORIES.has(payload.category) ? payload.category : 'codeSmell',
		keywords: payload.tags ?? [],
		title: payload.title,
		guidance: payload.guidance,
	};
	return {
		heuristic,
		score,
		matchedKeywords: [],
		matchedPatternCount: 0,
	};
}
