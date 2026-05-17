import * as assert from 'assert';
import {
	CompositeHeuristicRetriever,
	DEFAULT_RAG_CONFIG,
	JAVA_HEURISTICS,
	LexicalHeuristicRetriever,
	QdrantHeuristicRetriever,
	RagContextService,
	type EmbeddingClient,
	type HeuristicMatch,
	type HeuristicRetriever,
	type JavaHeuristic,
	type QdrantSearchHit,
	type RagConfig,
	type UdiaQdrantClient,
} from '../services/rag';

const SQL_SOURCE = `
public class SqlInjectionSample {
    public ResultSet findUser(String name) throws SQLException {
        String sql = "SELECT * FROM users WHERE name = '" + name + "'";
        Statement statement = connection.createStatement();
        return statement.executeQuery(sql);
    }
}
`;

const SWALLOWED_EXCEPTION_SOURCE = `
public class SwallowedExceptionSample {
    public void refresh(String value) {
        try {
            Integer.parseInt(value);
        } catch (NumberFormatException ex) {
        }
    }
}
`;

const CLEAN_SOURCE = `
public class CleanSample {
    public int add(int left, int right) {
        return left + right;
    }
}
`;

suite('RagContextService', () => {
	test('retrieves sql-injection heuristic for concatenated SQL', async () => {
		const service = new RagContextService();
		const result = await service.buildFromSource(SQL_SOURCE);

		assert.ok(result.retrievedIds.includes('sql-injection'), `expected sql-injection in ${result.retrievedIds.join(',')}`);
		assert.ok(result.text.includes('sql-injection'));
		assert.ok(result.text.includes('PreparedStatement'));
		assert.strictEqual(result.ragEnabled, true);
		assert.strictEqual(result.retrieverName, 'lexical');
	});

	test('retrieves swallowed-exception heuristic for empty catch block', async () => {
		const service = new RagContextService();
		const result = await service.buildFromSource(SWALLOWED_EXCEPTION_SOURCE);

		assert.ok(
			result.retrievedIds.includes('swallowed-exception'),
			`expected swallowed-exception in ${result.retrievedIds.join(',')}`,
		);
		assert.ok(result.text.includes('Exception is caught but ignored'));
	});

	test('returns empty-context message when no heuristic matches', async () => {
		const service = new RagContextService();
		const result = await service.buildFromSource(CLEAN_SOURCE);

		assert.strictEqual(result.retrievedIds.length, 0);
		assert.strictEqual(result.truncated, false);
		assert.strictEqual(result.text, DEFAULT_RAG_CONFIG.emptyContextMessage);
	});

	test('respects topK from injected config', async () => {
		const service = new RagContextService({
			config: { ...DEFAULT_RAG_CONFIG, topK: 1 },
		});
		const result = await service.buildFromSource(SQL_SOURCE);

		assert.strictEqual(result.retrievedIds.length, 1);
	});

	test('uses injected retriever and heuristics without touching defaults', async () => {
		const customHeuristic: JavaHeuristic = {
			id: 'always-match',
			category: 'codeSmell',
			keywords: ['probe'],
			title: 'Probe heuristic',
			guidance: 'Synthetic heuristic used only in tests.',
		};
		const stubRetriever: HeuristicRetriever = {
			name: 'stub',
			async retrieve(_source, heuristics): Promise<HeuristicMatch[]> {
				return heuristics.map((heuristic) => ({
					heuristic,
					score: 10,
					matchedKeywords: ['probe'],
					matchedPatternCount: 0,
				}));
			},
		};

		const service = new RagContextService({
			heuristics: [customHeuristic],
			retriever: stubRetriever,
		});
		const result = await service.buildFromSource('class Probe {}');

		assert.deepStrictEqual(result.retrievedIds, ['always-match']);
		assert.ok(result.text.includes('Probe heuristic'));
		assert.strictEqual(result.retrieverName, 'stub');
	});

	test('truncates context when payload exceeds maxContextChars', async () => {
		const tightConfig: RagConfig = { ...DEFAULT_RAG_CONFIG, maxContextChars: 120, topK: 5 };
		const service = new RagContextService({ config: tightConfig });

		const result = await service.buildFromSource(`${SQL_SOURCE}\n${SWALLOWED_EXCEPTION_SOURCE}`);

		assert.ok(result.text.length <= 200);
		assert.strictEqual(result.truncated, true);
		assert.ok(result.text.includes('truncated: yes'));
	});
});

suite('LexicalHeuristicRetriever', () => {
	test('orders matches by score and category priority', async () => {
		const retriever = new LexicalHeuristicRetriever();
		const matches = await retriever.retrieve(SQL_SOURCE, JAVA_HEURISTICS, DEFAULT_RAG_CONFIG);

		assert.ok(matches.length > 0);
		const firstId = matches[0].heuristic.id;
		assert.ok(['sql-injection', 'unclosed-resource'].includes(firstId));
	});

	test('does not perform any network access', async () => {
		const originalFetch = globalThis.fetch;
		let called = false;
		globalThis.fetch = (() => {
			called = true;
			throw new Error('fetch must not be called by the retriever');
		}) as typeof globalThis.fetch;
		try {
			const service = new RagContextService();
			await service.buildFromSource(SQL_SOURCE);
			await service.buildFromSource(CLEAN_SOURCE);
		} finally {
			globalThis.fetch = originalFetch;
		}
		assert.strictEqual(called, false);
	});
});

suite('QdrantHeuristicRetriever', () => {
	test('embeds source and maps Qdrant hits to HeuristicMatch', async () => {
		const embeddingClient: EmbeddingClient = {
			async embed(text) {
				assert.ok(text.length > 0);
				return [0.1, 0.2, 0.3];
			},
		};
		const hit: QdrantSearchHit = {
			score: 0.93,
			payload: {
				id: 'java:S2076',
				title: 'OS commands should not be vulnerable to injection',
				category: 'security',
				guidance: 'Use parameterized APIs and validate user input.',
				tags: ['cwe', 'injection'],
			},
		};
		const qdrant: Pick<UdiaQdrantClient, 'search'> = {
			async search(_vector, limit): Promise<QdrantSearchHit[]> {
				return [hit].slice(0, limit);
			},
		};

		const retriever = new QdrantHeuristicRetriever({
			embeddingClient,
			qdrant: qdrant as UdiaQdrantClient,
		});
		const matches = await retriever.retrieve('class A {}', [], {
			...DEFAULT_RAG_CONFIG,
			vectorMinScore: 0.5,
			topK: 3,
		});

		assert.strictEqual(matches.length, 1);
		assert.strictEqual(matches[0].heuristic.id, 'java:S2076');
		assert.strictEqual(matches[0].heuristic.category, 'security');
		assert.strictEqual(matches[0].score, 0.93);
		assert.strictEqual(retriever.name, 'qdrant');
	});

	test('filters out hits below vectorMinScore and emits debug info', async () => {
		const embeddingClient: EmbeddingClient = {
			async embed() {
				return [0.1];
			},
		};
		const qdrant: Pick<UdiaQdrantClient, 'search'> = {
			async search() {
				return [
					{ score: 0.42, payload: { id: 'java:S1', title: 't1', category: 'bug', guidance: '' } },
					{ score: 0.2, payload: { id: 'java:S2', title: 't2', category: 'bug', guidance: '' } },
				];
			},
		};
		let debug: { hitCount: number; kept: number; topScore: number | null } | undefined;
		const retriever = new QdrantHeuristicRetriever({
			embeddingClient,
			qdrant: qdrant as UdiaQdrantClient,
			onSearchDebug: (info) => {
				debug = { hitCount: info.hitCount, kept: info.kept, topScore: info.topScore };
			},
		});

		const matches = await retriever.retrieve('class A {}', [], {
			...DEFAULT_RAG_CONFIG,
			vectorMinScore: 0.35,
		});

		assert.strictEqual(matches.length, 1, 'only the hit above vectorMinScore should be kept');
		assert.strictEqual(matches[0].heuristic.id, 'java:S1');
		assert.deepStrictEqual(debug, { hitCount: 2, kept: 1, topScore: 0.42 });
	});

	test('ignores the lexical-tuned minScore (only vectorMinScore controls filtering)', async () => {
		const embeddingClient: EmbeddingClient = {
			async embed() {
				return [0.1];
			},
		};
		const qdrant: Pick<UdiaQdrantClient, 'search'> = {
			async search() {
				return [
					{ score: 0.6, payload: { id: 'java:S99', title: 't', category: 'bug', guidance: '' } },
				];
			},
		};
		const retriever = new QdrantHeuristicRetriever({
			embeddingClient,
			qdrant: qdrant as UdiaQdrantClient,
		});

		const matches = await retriever.retrieve('class A {}', [], {
			...DEFAULT_RAG_CONFIG,
			minScore: 1_000,
			vectorMinScore: 0.35,
		});

		assert.strictEqual(matches.length, 1, 'cosine 0.6 must pass when vectorMinScore=0.35 regardless of minScore');
	});

	test('returns empty matches when source is blank without calling embedder', async () => {
		let embedCalls = 0;
		const embeddingClient: EmbeddingClient = {
			async embed() {
				embedCalls += 1;
				return [0];
			},
		};
		const qdrant: Pick<UdiaQdrantClient, 'search'> = {
			async search() {
				return [];
			},
		};
		const retriever = new QdrantHeuristicRetriever({
			embeddingClient,
			qdrant: qdrant as UdiaQdrantClient,
		});

		const matches = await retriever.retrieve('   \n\t', [], DEFAULT_RAG_CONFIG);

		assert.strictEqual(matches.length, 0);
		assert.strictEqual(embedCalls, 0);
	});
});

suite('CompositeHeuristicRetriever', () => {
	const probeHeuristic: JavaHeuristic = {
		id: 'fallback-hit',
		category: 'codeSmell',
		keywords: ['fallback'],
		title: 'Fallback heuristic',
		guidance: 'Triggered only by the fallback retriever in tests.',
	};

	test('uses the primary retriever when it succeeds', async () => {
		const primary: HeuristicRetriever = {
			name: 'primary',
			async retrieve(): Promise<HeuristicMatch[]> {
				return [
					{
						heuristic: { ...probeHeuristic, id: 'primary-hit' },
						score: 1,
						matchedKeywords: [],
						matchedPatternCount: 0,
					},
				];
			},
		};
		const fallback: HeuristicRetriever = {
			name: 'fallback',
			async retrieve(): Promise<HeuristicMatch[]> {
				throw new Error('fallback must not be called when primary succeeds');
			},
		};
		const composite = new CompositeHeuristicRetriever({ primary, fallback });

		const matches = await composite.retrieve('source', [], DEFAULT_RAG_CONFIG);
		assert.strictEqual(matches[0].heuristic.id, 'primary-hit');
		assert.strictEqual(composite.name, 'primary');
	});

	test('falls back when the primary retriever throws', async () => {
		const primary: HeuristicRetriever = {
			name: 'qdrant',
			async retrieve(): Promise<HeuristicMatch[]> {
				throw new Error('connection refused');
			},
		};
		const fallback: HeuristicRetriever = {
			name: 'lexical',
			async retrieve(): Promise<HeuristicMatch[]> {
				return [
					{
						heuristic: probeHeuristic,
						score: 1,
						matchedKeywords: ['fallback'],
						matchedPatternCount: 0,
					},
				];
			},
		};
		let logged = false;
		const composite = new CompositeHeuristicRetriever({
			primary,
			fallback,
			onPrimaryFailure: ({ primary: primaryName, fallback: fallbackName, error }) => {
				assert.strictEqual(primaryName, 'qdrant');
				assert.strictEqual(fallbackName, 'lexical');
				assert.match(error.message, /connection refused/);
				logged = true;
			},
		});

		const matches = await composite.retrieve('source', [], DEFAULT_RAG_CONFIG);
		assert.strictEqual(matches[0].heuristic.id, 'fallback-hit');
		assert.strictEqual(composite.name, 'lexical');
		assert.strictEqual(logged, true);
	});
});
