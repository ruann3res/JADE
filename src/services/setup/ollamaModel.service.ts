export type OllamaModelDependencies = {
	fetchImpl?: typeof fetch;
};

export type OllamaPullProgress = {
	readonly status: string;
	readonly completed?: number;
	readonly total?: number;
};

/**
 * Minimal Ollama model orchestration used by the setup wizard:
 * - `/api/tags` to see if the model is already downloaded
 * - `/api/pull` (NDJSON stream) to download it on demand
 */
export class OllamaModelService {
	private readonly fetchImpl: typeof fetch;

	constructor(deps: OllamaModelDependencies = {}) {
		this.fetchImpl = deps.fetchImpl ?? fetch;
	}

	async isModelInstalled(baseUrl: string, model: string): Promise<boolean> {
		const url = `${trimSlash(baseUrl)}/api/tags`;
		const response = await this.fetchImpl(url, { method: 'GET' });
		if (!response.ok) {
			throw new Error(`Ollama unreachable at ${url} (HTTP ${response.status}).`);
		}
		const body = (await response.json()) as { models?: Array<{ name?: string }> };
		const names = (body.models ?? []).map((entry) => entry.name ?? '');
		return names.some((name) => name === model || name.startsWith(`${model}:`));
	}

	async pull(
		baseUrl: string,
		model: string,
		onProgress?: (progress: OllamaPullProgress) => void,
	): Promise<void> {
		const url = `${trimSlash(baseUrl)}/api/pull`;
		const response = await this.fetchImpl(url, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ name: model, stream: true }),
		});
		if (!response.ok || !response.body) {
			const body = response.body ? await response.text().catch(() => '') : '';
			throw new Error(`Ollama pull failed: HTTP ${response.status} ${body.slice(0, 200)}`);
		}
		const reader = response.body.getReader();
		const decoder = new TextDecoder();
		let buffer = '';
		while (true) {
			const { value, done } = await reader.read();
			if (done) {
				break;
			}
			buffer += decoder.decode(value, { stream: true });
			let newlineIndex = buffer.indexOf('\n');
			while (newlineIndex !== -1) {
				const line = buffer.slice(0, newlineIndex).trim();
				buffer = buffer.slice(newlineIndex + 1);
				if (line.length > 0) {
					const parsed = safeParse(line);
					if (parsed) {
						onProgress?.(parsed);
					}
				}
				newlineIndex = buffer.indexOf('\n');
			}
		}
	}
}

function safeParse(line: string): OllamaPullProgress | undefined {
	try {
		const data = JSON.parse(line) as Partial<OllamaPullProgress> & { error?: string };
		if (data.error) {
			throw new Error(data.error);
		}
		return {
			status: typeof data.status === 'string' ? data.status : 'pulling',
			completed: typeof data.completed === 'number' ? data.completed : undefined,
			total: typeof data.total === 'number' ? data.total : undefined,
		};
	} catch {
		return undefined;
	}
}

function trimSlash(value: string): string {
	return value.replace(/\/$/, '');
}
