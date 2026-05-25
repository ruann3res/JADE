import * as assert from 'assert';
import type * as vscode from 'vscode';
import { createRagContextService } from '../services/rag';
import {
	SetupStateService,
	SonarCloudAuthService,
	SonarRulesIngestionService,
} from '../services/setup';
import type { EmbeddingClient, JadeQdrantClient } from '../services/rag';

type MutableMap = Map<string, unknown>;

function createFakeContext(): vscode.ExtensionContext {
	const state: MutableMap = new Map();
	const secrets: MutableMap = new Map();

	const memento: vscode.Memento = {
		keys: () => Array.from(state.keys()),
		get: <T>(key: string, defaultValue?: T) => (state.has(key) ? (state.get(key) as T) : (defaultValue as T)),
		update: async (key: string, value: unknown) => {
			if (value === undefined) {
				state.delete(key);
			} else {
				state.set(key, value);
			}
		},
	};

	const secretStorage = {
		get: async (key: string) => (secrets.has(key) ? String(secrets.get(key)) : undefined),
		store: async (key: string, value: string) => {
			secrets.set(key, value);
		},
		delete: async (key: string) => {
			secrets.delete(key);
		},
		keys: async () => Array.from(secrets.keys()),
		onDidChange: (() => ({ dispose: () => undefined })),
	} as unknown as vscode.SecretStorage;

	return {
		globalState: memento as vscode.ExtensionContext['globalState'],
		secrets: secretStorage,
	} as unknown as vscode.ExtensionContext;
}

suite('SetupStateService', () => {
	test('starts incomplete and round-trips token + organization', async () => {
		const context = createFakeContext();
		const service = new SetupStateService(context);

		assert.strictEqual(service.isComplete(), false);
		assert.strictEqual(await service.getSonarToken(), undefined);

		await service.setSonarToken('squ_token_xyz');
		await service.setSonarOrganization('jade-org');

		assert.strictEqual(await service.getSonarToken(), 'squ_token_xyz');
		assert.strictEqual(await service.getSonarOrganization(), 'jade-org');
	});

	test('markComplete + reset toggle the global state flag and clear secrets', async () => {
		const context = createFakeContext();
		const service = new SetupStateService(context);
		await service.setSonarToken('squ_token_xyz');

		await service.markComplete({
			ruleCount: 42,
			completedAt: '2026-05-17T00:00:00Z',
			qdrantCollection: 'sonar_java_rules',
			embeddingModel: 'nomic-embed-text',
		});

		assert.strictEqual(service.isComplete(), true);
		assert.deepStrictEqual(service.getMetadata(), {
			ruleCount: 42,
			completedAt: '2026-05-17T00:00:00Z',
			qdrantCollection: 'sonar_java_rules',
			embeddingModel: 'nomic-embed-text',
		});

		await service.reset();
		assert.strictEqual(service.isComplete(), false);
		assert.strictEqual(await service.getSonarToken(), undefined);
		assert.strictEqual(service.getMetadata(), undefined);
	});
});

suite('createRagContextService (setup gating)', () => {
	test('without setup, returns lexical-only RagContextService', async () => {
		const context = createFakeContext();
		const setupState = new SetupStateService(context);
		const service = createRagContextService({
			ragConfig: {
				qdrantUrl: 'http://localhost:6333',
				qdrantCollection: 'sonar_java_rules',
				embeddingModel: 'nomic-embed-text',
			},
			ollamaConfig: { baseUrl: 'http://127.0.0.1:11434', timeoutMs: 60_000 },
			setupState,
		});

		const result = await service.buildFromSource(`
			class Probe {
				String sql() {
					return "SELECT * FROM users WHERE id = '" + id + "'";
				}
			}
		`);
		assert.strictEqual(result.retrieverName, 'lexical');
		assert.strictEqual(result.ragEnabled, true);
	});

	test('after setup, returns composite retriever (Qdrant primary)', async () => {
		const context = createFakeContext();
		const setupState = new SetupStateService(context);
		await setupState.markComplete({
			ruleCount: 10,
			completedAt: new Date().toISOString(),
			qdrantCollection: 'sonar_java_rules',
			embeddingModel: 'nomic-embed-text',
		});

		const service = createRagContextService({
			ragConfig: {
				qdrantUrl: 'http://localhost:6333',
				qdrantCollection: 'sonar_java_rules',
				embeddingModel: 'nomic-embed-text',
			},
			ollamaConfig: { baseUrl: 'http://127.0.0.1:11434', timeoutMs: 60_000 },
			setupState,
		});

		const originalFetch = globalThis.fetch;
		globalThis.fetch = (() => {
			throw new Error('network unreachable in tests');
		}) as typeof globalThis.fetch;
		try {
			const result = await service.buildFromSource(`
				class Probe {
					String sql() {
						return "SELECT * FROM users WHERE id = '" + id + "'";
					}
				}
			`);
			assert.strictEqual(
				result.retrieverName,
				'lexical',
				'composite must fall back to lexical when Qdrant network call fails',
			);
		} finally {
			globalThis.fetch = originalFetch;
		}
	});
});

suite('SonarRulesIngestionService', () => {
	test('lists rules, fetches descriptions, embeds and upserts to Qdrant', async () => {
		const fetchCalls: string[] = [];
		const fetchImpl: typeof fetch = async (input) => {
			const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
			fetchCalls.push(url);
			if (url.includes('/api/rules/search')) {
				return new Response(
					JSON.stringify({ rules: [{ key: 'java:S1234' }, { key: 'java:S5678' }], total: 2 }),
					{ status: 200, headers: { 'Content-Type': 'application/json' } },
				);
			}
			if (url.includes('/api/rules/show')) {
				const key = new URL(url).searchParams.get('key') ?? 'unknown';
				return new Response(
					JSON.stringify({
						rule: {
							key,
							name: `Rule ${key}`,
							type: 'BUG',
							htmlDesc: '<p>Be careful with concatenated SQL.</p>',
							tags: ['sql', 'injection'],
						},
					}),
					{ status: 200, headers: { 'Content-Type': 'application/json' } },
				);
			}
			throw new Error(`Unexpected fetch URL: ${url}`);
		};

		const embedder: EmbeddingClient = {
			async embed(text) {
				assert.ok(text.length > 0);
				return [0.1, 0.2, 0.3, 0.4];
			},
		};

		const upserts: Array<{ id: string | number; vector: number[] }> = [];
		const qdrant: Pick<JadeQdrantClient, 'ensureCollection' | 'upsert'> = {
			async ensureCollection() {
				return;
			},
			async upsert(points) {
				for (const point of points) {
					upserts.push({ id: point.id, vector: point.vector });
				}
			},
		};

		const service = new SonarRulesIngestionService({
			embedder,
			qdrant: qdrant as JadeQdrantClient,
			fetchImpl,
		});

		const progress: string[] = [];
		const result = await service.run(
			{
				sonarUrl: 'https://sonarcloud.io',
				sonarToken: 'token',
				requestDelayMs: 0,
				maxRules: 2,
			},
			(update) => progress.push(update.phase),
		);

		assert.strictEqual(result.ruleCount, 2);
		assert.strictEqual(result.failures, 0);
		assert.strictEqual(result.vectorSize, 4);
		assert.strictEqual(upserts.length, 2);
		assert.ok(progress.includes('done'));
		assert.ok(fetchCalls.some((url) => url.includes('/api/rules/search')));
		assert.ok(fetchCalls.some((url) => url.includes('/api/rules/show')));
	});
});

suite('SonarCloudAuthService', () => {
	test('returns ok=true when Sonar reports visible rules', async () => {
		const fetchImpl: typeof fetch = async () =>
			new Response(JSON.stringify({ total: 500 }), { status: 200 });
		const service = new SonarCloudAuthService({ fetchImpl });

		const result = await service.validate({
			sonarUrl: 'https://sonarcloud.io',
			token: 'good-token',
		});

		assert.strictEqual(result.ok, true);
		assert.strictEqual(result.ruleCount, 500);
	});

	test('returns ok=false with diagnostic info on HTTP error', async () => {
		const fetchImpl: typeof fetch = async () => new Response('forbidden', { status: 403 });
		const service = new SonarCloudAuthService({ fetchImpl });

		const result = await service.validate({
			sonarUrl: 'https://sonarcloud.io',
			token: 'bad-token',
		});

		assert.strictEqual(result.ok, false);
		assert.strictEqual(result.httpStatus, 403);
		assert.ok(result.error?.includes('403'));
		assert.strictEqual(result.requiresOrganization, false);
	});

	test('flags requiresOrganization when Sonar reports the parameter is missing', async () => {
		const fetchImpl: typeof fetch = async () =>
			new Response(
				JSON.stringify({ errors: [{ msg: "The 'organization' parameter is missing" }] }),
				{ status: 400, headers: { 'Content-Type': 'application/json' } },
			);
		const service = new SonarCloudAuthService({ fetchImpl });

		const result = await service.validate({
			sonarUrl: 'https://sonarcloud.io',
			token: 'good-token',
		});

		assert.strictEqual(result.ok, false);
		assert.strictEqual(result.httpStatus, 400);
		assert.strictEqual(result.requiresOrganization, true);
	});

	test('flags requiresOrganization when the supplied organization key is unknown', async () => {
		const fetchImpl: typeof fetch = async () =>
			new Response(
				JSON.stringify({ errors: [{ msg: "No organization with key 'bogus' found" }] }),
				{ status: 404, headers: { 'Content-Type': 'application/json' } },
			);
		const service = new SonarCloudAuthService({ fetchImpl });

		const result = await service.validate({
			sonarUrl: 'https://sonarcloud.io',
			token: 'good-token',
			organization: 'bogus',
		});

		assert.strictEqual(result.ok, false);
		assert.strictEqual(result.httpStatus, 404);
		assert.strictEqual(result.requiresOrganization, true);
	});
});
