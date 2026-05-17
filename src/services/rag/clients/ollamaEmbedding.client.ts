export type OllamaEmbeddingConfig = {
	readonly baseUrl: string;
	readonly model: string;
	readonly timeoutMs?: number;
};

export interface EmbeddingClient {
	embed(text: string): Promise<number[]>;
}

/** Thin wrapper around `POST /api/embeddings` of an Ollama server. */
export class OllamaEmbeddingClient implements EmbeddingClient {
	constructor(private readonly config: OllamaEmbeddingConfig) {}

	async embed(text: string): Promise<number[]> {
		const url = `${this.config.baseUrl.replace(/\/$/, '')}/api/embeddings`;
		const controller = new AbortController();
		const timeoutMs = this.config.timeoutMs ?? 30_000;
		const timer = setTimeout(() => controller.abort(), timeoutMs);
		try {
			const response = await fetch(url, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ model: this.config.model, prompt: text }),
				signal: controller.signal,
			});
			if (!response.ok) {
				const body = await response.text().catch(() => '');
				throw new Error(`Ollama embeddings HTTP ${response.status}: ${body.slice(0, 200)}`);
			}
			const data = (await response.json()) as { embedding?: unknown };
			if (!Array.isArray(data.embedding) || data.embedding.length === 0) {
				throw new Error('Ollama embeddings returned an empty vector');
			}
			return data.embedding.map((value) => (typeof value === 'number' ? value : 0));
		} finally {
			clearTimeout(timer);
		}
	}
}
