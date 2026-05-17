import type { QdrantClient } from '@qdrant/js-client-rest' with { 'resolution-mode': 'import' };
import type { FeedbackCategory } from '../../../entities/feedback';

export type QdrantRulePayload = {
	readonly id: string;
	readonly title: string;
	readonly category: FeedbackCategory;
	readonly guidance: string;
	readonly severity?: string;
	readonly sonarType?: string;
	readonly tags?: readonly string[];
	readonly cleanCodeAttribute?: string;
};

export type QdrantSearchHit = {
	readonly score: number;
	readonly payload: QdrantRulePayload;
};

export type QdrantClientConfig = {
	readonly url: string;
	readonly apiKey?: string;
	readonly collection: string;
	readonly vectorSize: number;
	readonly searchTimeoutMs?: number;
};

/**
 * Slim adapter over `@qdrant/js-client-rest`.
 * Uses a dynamic import because the package is ESM-only while the extension is bundled as CJS.
 */
export class UdiaQdrantClient {
	private clientPromise: Promise<QdrantClient> | null = null;

	constructor(private readonly config: QdrantClientConfig) {}

	private async getClient(): Promise<QdrantClient> {
		if (!this.clientPromise) {
			this.clientPromise = import('@qdrant/js-client-rest').then(
				(module) => new module.QdrantClient({ url: this.config.url, apiKey: this.config.apiKey }),
			);
		}
		return this.clientPromise;
	}

	async ensureCollection(): Promise<void> {
		const client = await this.getClient();
		const existing = await client.getCollections();
		const exists = existing.collections.some((collection) => collection.name === this.config.collection);
		if (exists) {
			return;
		}
		await client.createCollection(this.config.collection, {
			vectors: { size: this.config.vectorSize, distance: 'Cosine' },
		});
	}

	async upsert(points: Array<{ id: string | number; vector: number[]; payload: QdrantRulePayload }>): Promise<void> {
		if (points.length === 0) {
			return;
		}
		const client = await this.getClient();
		await client.upsert(this.config.collection, { wait: true, points });
	}

	async search(vector: number[], limit: number): Promise<QdrantSearchHit[]> {
		const client = await this.getClient();
		const results = await client.search(this.config.collection, {
			vector,
			limit,
			with_payload: true,
		});
		return results
			.filter((hit) => hit.payload && typeof hit.score === 'number')
			.map((hit) => ({
				score: hit.score as number,
				payload: hit.payload as unknown as QdrantRulePayload,
			}));
	}
}
