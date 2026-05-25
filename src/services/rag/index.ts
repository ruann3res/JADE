export { RagContextService } from './ragContext.service';
export type { RagContextServiceDependencies } from './ragContext.service';
export { createRagContextService } from './ragContextFactory';
export { LexicalHeuristicRetriever } from './lexicalHeuristicRetriever.service';
export { DefaultRagContextFormatter } from './ragContextFormatter.service';
export { DEFAULT_RAG_CONFIG } from './config/rag.defaults';
export { JAVA_HEURISTICS } from './data/javaHeuristics';
export { QdrantHeuristicRetriever } from './retrievers/qdrantHeuristicRetriever.service';
export type {
	QdrantHeuristicRetrieverDependencies,
	QdrantSearchDebug,
} from './retrievers/qdrantHeuristicRetriever.service';
export {
	CompositeHeuristicRetriever,
	type CompositeFailureLogger,
	type CompositeHeuristicRetrieverDependencies,
} from './retrievers/compositeHeuristicRetriever.service';
export { OllamaEmbeddingClient } from './clients/ollamaEmbedding.client';
export type { EmbeddingClient, OllamaEmbeddingConfig } from './clients/ollamaEmbedding.client';
export { JadeQdrantClient } from './clients/qdrant.client';
export type { QdrantClientConfig, QdrantRulePayload, QdrantSearchHit } from './clients/qdrant.client';
export type {
	FormattedRagContext,
	HeuristicMatch,
	HeuristicRetriever,
	JavaHeuristic,
	RagConfig,
	RagContextFormatter,
	RagContextResult,
} from './rag.types';
