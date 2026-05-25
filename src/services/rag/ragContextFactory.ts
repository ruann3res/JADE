import { jadeLog } from '../../outputChannel';
import type { OllamaRuntimeConfig } from '../config/ollamaConfig.service';
import type { RagRuntimeConfig } from '../config/ragConfig.service';
import type { SetupStateService } from '../setup/setupState.service';
import { OllamaEmbeddingClient } from './clients/ollamaEmbedding.client';
import { JadeQdrantClient } from './clients/qdrant.client';
import { LexicalHeuristicRetriever } from './lexicalHeuristicRetriever.service';
import { RagContextService } from './ragContext.service';
import { CompositeHeuristicRetriever } from './retrievers/compositeHeuristicRetriever.service';
import { QdrantHeuristicRetriever } from './retrievers/qdrantHeuristicRetriever.service';

export type CreateRagContextServiceInput = {
	ragConfig: RagRuntimeConfig;
	ollamaConfig: Pick<OllamaRuntimeConfig, 'baseUrl' | 'timeoutMs'>;
	setupState?: SetupStateService;
};

/**
 * Builds the production `RagContextService`.
 *
 * The Qdrant-backed retriever is only enabled when the user has run `JADE: Setup`
 * (`SetupStateService.isComplete()`). Without setup, callers transparently get the
 * embedded lexical retriever — no network calls, no surprises.
 *
 * When Qdrant is enabled, a CompositeHeuristicRetriever runs Qdrant first and falls
 * back to the lexical retriever on any failure (network, missing collection, etc).
 */
export function createRagContextService(input: CreateRagContextServiceInput): RagContextService {
	const lexical = new LexicalHeuristicRetriever();

	const qdrantEnabled = input.setupState?.isComplete() === true;
	if (!qdrantEnabled) {
		return new RagContextService({ retriever: lexical });
	}

	const embeddingClient = new OllamaEmbeddingClient({
		baseUrl: input.ollamaConfig.baseUrl,
		model: input.ragConfig.embeddingModel,
		timeoutMs: Math.min(input.ollamaConfig.timeoutMs, 60_000),
	});

	const qdrantClient = new JadeQdrantClient({
		url: input.ragConfig.qdrantUrl,
		collection: input.ragConfig.qdrantCollection,
		vectorSize: 0,
	});

	const primary = new QdrantHeuristicRetriever({
		embeddingClient,
		qdrant: qdrantClient,
		onSearchDebug: ({ hitCount, kept, topScore, minScore, topIds }) => {
			const top = topScore !== null ? topScore.toFixed(3) : 'n/a';
			jadeLog(
				`RAG[qdrant]: hits=${hitCount}, kept=${kept}, top=${top} (minScore=${minScore}), candidates=${topIds.join(', ') || '-'}`,
			);
		},
	});

	return new RagContextService({
		retriever: new CompositeHeuristicRetriever({
			primary,
			fallback: lexical,
			onPrimaryFailure: ({ primary: primaryName, fallback, error }) => {
				jadeLog(`RAG: ${primaryName} failed (${error.message}); using ${fallback} fallback.`);
			},
		}),
	});
}
