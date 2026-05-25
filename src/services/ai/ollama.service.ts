import * as http from 'node:http';
import * as https from 'node:https';

export type OllamaChatMessage = { role: 'user' | 'assistant' | 'system'; content: string };

export type OllamaChatResult = { content: string; raw: string };

export const DEFAULT_OLLAMA_TIMEOUT_MS = 900_000;

export type OllamaChatRequestOptions = {
	format?: 'json';
	modelOptions?: { temperature?: number; num_predict?: number };
	timeoutMs?: number;
};

export function normalizeOllamaBaseUrl(baseUrl: string): string {
	const trimmed = baseUrl.trim().replace(/\/+$/, '');
	const fallback = 'http://127.0.0.1:11434';
	if (!trimmed) {
		return fallback;
	}
	try {
		const url = new URL(trimmed);
		if (url.hostname === 'localhost') {
			url.hostname = '127.0.0.1';
		}
		const path = url.pathname.replace(/\/+$/, '') || '';
		if (path && path !== '/') {
			return `${url.protocol}//${url.host}${path}`;
		}
		return `${url.protocol}//${url.host}`;
	} catch {
		return trimmed;
	}
}

function collectErrorChain(err: unknown): string {
	const parts: string[] = [];
	let current: unknown = err;
	let depth = 0;
	while (current !== null && current !== undefined && depth < 8) {
		if (current instanceof Error) {
			parts.push(current.message);
			current = current.cause;
		} else if (typeof current === 'object' && current !== null && 'message' in current) {
			parts.push(String((current as { message: unknown }).message));
			current = 'cause' in current ? (current as { cause?: unknown }).cause : undefined;
		} else {
			parts.push(String(current));
			break;
		}
		depth += 1;
	}
	return parts.filter((part) => part.length > 0).join(' - ');
}

function postJsonWithTimeout(url: string, payload: string, timeoutMs: number): Promise<{ status: number; body: string }> {
	return new Promise((resolve, reject) => {
		const parsedUrl = new URL(url);
		const client = parsedUrl.protocol === 'https:' ? https : http;
		const req = client.request(
			{
				protocol: parsedUrl.protocol,
				hostname: parsedUrl.hostname,
				port: parsedUrl.port,
				path: `${parsedUrl.pathname}${parsedUrl.search}`,
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Content-Length': Buffer.byteLength(payload),
				},
			},
			(res) => {
				const chunks: Buffer[] = [];
				res.on('data', (chunk: Buffer | string) => {
					chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
				});
				res.on('end', () => {
					const body = Buffer.concat(chunks).toString('utf-8');
					resolve({ status: res.statusCode ?? 0, body });
				});
			},
		);

		req.setTimeout(timeoutMs, () => {
			req.destroy(new Error(`Timeout after ${timeoutMs} ms without a complete response from Ollama`));
		});
		req.on('error', (err) => reject(err));
		req.write(payload);
		req.end();
	});
}

export async function ollamaChat(
	baseUrl: string,
	model: string,
	messages: OllamaChatMessage[],
	requestOptions?: OllamaChatRequestOptions,
): Promise<OllamaChatResult> {
	const normalizedBase = normalizeOllamaBaseUrl(baseUrl);
	const url = `${normalizedBase.replace(/\/$/, '')}/api/chat`;
	const body: Record<string, unknown> = { model, messages, stream: false };
	if (requestOptions?.format === 'json') {
		body.format = 'json';
	}
	if (requestOptions?.modelOptions && Object.keys(requestOptions.modelOptions).length > 0) {
		body.options = requestOptions.modelOptions;
	}
	const timeoutMs =
		typeof requestOptions?.timeoutMs === 'number' && requestOptions.timeoutMs > 0
			? requestOptions.timeoutMs
			: DEFAULT_OLLAMA_TIMEOUT_MS;

	let response: { status: number; body: string };
	try {
		response = await postJsonWithTimeout(url, JSON.stringify(body), timeoutMs);
	} catch (error) {
		const chain = collectErrorChain(error);
		throw new Error(
			`Ollama (${url}): ${chain || 'fetch failed'}\n\nEnsure the Ollama server is reachable at ${normalizedBase} and adjust jade.ollama.baseUrl or jade.ollama.requestTimeoutMs if needed.`,
		);
	}

	if (response.status < 200 || response.status >= 300) {
		throw new Error(`Ollama HTTP ${response.status}: ${response.body.slice(0, 500)}`);
	}

	let content = response.body;
	try {
		const parsed = JSON.parse(response.body) as { message?: { content?: string } };
		if (parsed.message?.content) {
			content = parsed.message.content;
		}
	} catch {
		void 0;
	}
	return { content, raw: response.body };
}
