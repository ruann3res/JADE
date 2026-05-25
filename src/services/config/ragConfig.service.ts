import * as vscode from 'vscode';

/**
 * Fixed collection name used by the setup wizard and the runtime retriever.
 * Promoted from a user-facing setting because mismatches between ingestion and
 * retrieval simply break the RAG path with no useful flexibility.
 */
export const DEFAULT_QDRANT_COLLECTION = 'sonar_java_rules';

export type RagRuntimeConfig = {
	qdrantUrl: string;
	qdrantCollection: string;
	embeddingModel: string;
};

export class RagConfigService {
	read(): RagRuntimeConfig {
		const config = vscode.workspace.getConfiguration('jade');
		const qdrantUrl = String(config.get('rag.qdrant.url') ?? 'http://localhost:6333');
		const embeddingModel = String(config.get('rag.embedding.model') ?? 'nomic-embed-text');

		return {
			qdrantUrl,
			qdrantCollection: DEFAULT_QDRANT_COLLECTION,
			embeddingModel,
		};
	}
}
