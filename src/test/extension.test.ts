import * as assert from 'assert';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

import * as vscode from 'vscode';
import { createJavaSourceBatches } from '../services/ai/aiBatchAnalysis.service';
import { parseAiSuggestionsJson } from '../services/ai/promptBuilder.service';
import type {
	AiAnalysisClient,
	Clock,
	ExportedArtifact,
	ModelComparisonParameters,
	ModelComparisonRunResult,
	ResultExporter,
	SampleRepository,
} from '../services/modelComparison/modelComparison.types';
import {
	calculateMetrics,
	matchFindings,
	ModelComparisonRunner,
} from '../services/modelComparison/modelComparisonRunner.service';
import { FileSystemResultExporter } from '../services/modelComparison/resultExporter.service';

suite('Extension Test Suite', () => {
	vscode.window.showInformationMessage('Start all tests.');

	test('Sample test', () => {
		assert.strictEqual(-1, [1, 2, 3].indexOf(5));
		assert.strictEqual(-1, [1, 2, 3].indexOf(0));
	});

	test('parseAiSuggestionsJson accepts string ranges as the anchor line', () => {
		const parsed = parseAiSuggestionsJson('{"suggestions":[{"id":"1","line":"108-134","category":"Security","summary":"SQL injection","detail":"Use prepared statements."}]}');

		assert.strictEqual(parsed.structuredJsonEnvelope, true);
		assert.strictEqual(parsed.suggestions.length, 1);
		assert.strictEqual(parsed.suggestions[0].line, 108);
		assert.strictEqual(parsed.suggestions[0].category, 'security');
	});

	test('createJavaSourceBatches splits by line count with overlap', () => {
		const source = Array.from({ length: 5 }, (_, index) => `line ${index + 1}`).join('\n');
		const batches = createJavaSourceBatches(source, { maxLines: 3, overlapLines: 1 });

		assert.deepStrictEqual(
			batches.map((batch) => [batch.lineStart, batch.lineEnd, batch.source]),
			[
				[1, 3, 'line 1\nline 2\nline 3'],
				[3, 5, 'line 3\nline 4\nline 5'],
			],
		);
	});

	test('matchFindings matches expected findings one-to-one', () => {
		const matches = matchFindings({
			lineTolerance: 2,
			lineCount: 20,
			evaluationMode: 'groundTruth',
			expectedFindings: [
				{
					id: 'exp-1',
					file: 'A.java',
					line: 10,
					category: 'bug',
					summary: 'Expected bug',
					rationale: 'Test rationale',
				},
			],
			suggestions: [
				{ id: 's1', line: 11, category: 'bug', summary: 'Bug', detail: 'Matches.' },
				{ id: 's2', line: 10, category: 'bug', summary: 'Duplicate', detail: 'Duplicate.' },
				{ id: 's3', line: 100, category: 'bug', summary: 'Invalid', detail: 'Invalid.' },
			],
		});

		assert.strictEqual(matches[0].expected?.id, 'exp-1');
		assert.strictEqual(matches[0].rating, 5);
		assert.strictEqual(matches[1].falsePositive, true);
		assert.strictEqual(matches[1].rating, 1);
		assert.strictEqual(matches[2].falsePositive, false);
		assert.strictEqual(matches[2].rating, 0);
	});

	test('calculateMetrics calculates false positives and ratings', () => {
		const suggestions = [
			{ id: 's1', line: 4, category: 'security' as const, summary: 'SQL', detail: 'Use parameters.' },
			{ id: 's2', line: 8, category: 'bug' as const, summary: 'Other', detail: 'Other.' },
			{ id: 's3', line: 99, category: 'bug' as const, summary: 'Invalid', detail: 'Invalid.' },
		];
		const matches = matchFindings({
			suggestions,
			lineTolerance: 1,
			lineCount: 10,
			evaluationMode: 'groundTruth',
			expectedFindings: [
				{
					id: 'exp-1',
					file: 'A.java',
					line: 5,
					category: 'security',
					summary: 'Expected SQL',
					rationale: 'Test rationale',
				},
			],
		});

		const metrics = calculateMetrics({
			responseTimeMs: 123,
			suggestions,
			matches,
			lineCount: 10,
		});

		assert.strictEqual(metrics.responseTimeMs, 123);
		assert.strictEqual(metrics.rawSuggestionCount, 3);
		assert.strictEqual(metrics.validSuggestionCount, 2);
		assert.strictEqual(metrics.invalidSuggestionCount, 1);
		assert.strictEqual(metrics.usefulSuggestionCount, 1);
		assert.strictEqual(metrics.falsePositiveCount, 1);
		assert.strictEqual(metrics.falsePositiveRate, 0.5);
		assert.strictEqual(metrics.averageFeedbackRating, 2);
	});

	test('matchFindings does not mark open-file suggestions as false positives without ground truth', () => {
		const matches = matchFindings({
			evaluationMode: 'none',
			lineTolerance: 2,
			lineCount: 10,
			expectedFindings: [],
			suggestions: [
				{ id: 's1', line: 3, category: 'bug', summary: 'Open file finding', detail: 'Not evaluated.' },
			],
		});

		assert.strictEqual(matches.length, 1);
		assert.strictEqual(matches[0].falsePositive, false);
		assert.strictEqual(matches[0].rating, 0);
		assert.strictEqual(matches[0].expected, undefined);
	});

	test('FileSystemResultExporter writes JSON and CSV artifacts', async () => {
		const root = await fs.mkdtemp(path.join(os.tmpdir(), 'udia-model-comparison-'));
		const exporter = new FileSystemResultExporter(root);
		const result = buildMinimalRunResult('run-20260517-120000');

		const artifacts = await exporter.export(result);
		const csvPath = path.join(root, 'model-comparison-results', 'run-20260517-120000.csv');
		const latestJsonPath = path.join(root, 'model-comparison-results', 'latest.json');
		const csv = await fs.readFile(csvPath, 'utf-8');
		const latestJson = JSON.parse(await fs.readFile(latestJsonPath, 'utf-8')) as ModelComparisonRunResult;

		assert.strictEqual(artifacts.length, 4);
		assert.ok(csv.includes('responseTimeMs'));
		assert.ok(csv.includes('deepseek-coder:6.7b'));
		assert.strictEqual(latestJson.runId, result.runId);
	});

	test('ModelComparisonRunner works with injected fake dependencies', async () => {
		const exporter = new MemoryResultExporter();
		const runner = new ModelComparisonRunner({
			sampleRepository: new FakeSampleRepository(),
			analysisClient: new FakeAiAnalysisClient(),
			resultExporter: exporter,
			clock: new FakeClock(),
			models: [{ id: 'deepseek-coder:6.7b', label: 'Deepseek' }],
		});

		const output = await runner.run({
			baseUrl: 'http://127.0.0.1:11434',
			timeoutMs: 1000,
			extensionVersion: '0.0.1',
			parameters: defaultTestParameters(),
		});

		assert.strictEqual(output.result.results.length, 1);
		assert.strictEqual(output.result.summary[0].usefulSuggestionCount, 1);
		assert.strictEqual(output.result.summary[0].falsePositiveCount, 1);
		assert.strictEqual(exporter.lastResult?.runId, output.result.runId);
	});
});

function defaultTestParameters(): ModelComparisonParameters {
	return {
		temperature: 0.15,
		numPredict: 4096,
		batchMaxLines: 180,
		batchOverlapLines: 20,
		lineTolerance: 2,
		sonarEnabled: false,
	};
}

function buildMinimalRunResult(runId: string): ModelComparisonRunResult {
	return {
		runId,
		startedAt: '2026-05-17T12:00:00.000Z',
		finishedAt: '2026-05-17T12:00:01.000Z',
		metadata: {
			extensionVersion: '0.0.1',
			promptSource: 'test',
			models: [{ id: 'deepseek-coder:6.7b', label: 'Deepseek' }],
			parameters: defaultTestParameters(),
			samples: [{ fileName: 'A.java', relativePath: 'samples/model-comparison/A.java', lineCount: 1, sha256: 'abc' }],
		},
		results: [],
		summary: [
			{
				modelId: 'deepseek-coder:6.7b',
				modelLabel: 'Deepseek',
				file: 'A.java',
				responseTimeMs: 10,
				rawSuggestionCount: 1,
				validSuggestionCount: 1,
				usefulSuggestionCount: 1,
				averageFeedbackRating: 5,
				falsePositiveCount: 0,
				falsePositiveRate: 0,
			},
		],
	};
}

class FakeSampleRepository implements SampleRepository {
	async loadSamples() {
		return [
			{
				fileName: 'A.java',
				relativePath: 'samples/model-comparison/A.java',
				source: 'class A {}',
				lineCount: 1,
				sha256: 'abc',
				evaluationMode: 'groundTruth' as const,
				expectedFindings: [
					{
						id: 'exp-1',
						file: 'A.java',
						line: 1,
						category: 'codeSmell' as const,
						summary: 'Expected',
						rationale: 'Expected rationale',
					},
				],
			},
		];
	}
}

class FakeAiAnalysisClient implements AiAnalysisClient {
	async analyze() {
		return {
			suggestions: [
				{ id: 's1', line: 1, category: 'codeSmell' as const, summary: 'Expected', detail: 'Expected.' },
				{ id: 's2', line: 1, category: 'bug' as const, summary: 'Extra', detail: 'Extra.' },
			],
			body: '{"suggestions":[]}',
			batchStats: [],
			promptDebug: {
				systemRole: 'system',
				systemCharLength: 1,
				firstUserCharLength: 1,
				totalUserCharLength: 1,
				maxUserCharLength: 1,
				systemFirstLine: 'test',
				containsRoleTag: true,
			},
		};
	}
}

class FakeClock implements Clock {
	private current = 1_000;

	now(): number {
		this.current += 50;
		return this.current;
	}

	isoNow(): string {
		return '2026-05-17T12:00:00.000Z';
	}
}

class MemoryResultExporter implements ResultExporter {
	lastResult: ModelComparisonRunResult | undefined;

	async export(result: ModelComparisonRunResult): Promise<ExportedArtifact[]> {
		this.lastResult = result;
		return [{ format: 'json', path: 'memory/latest.json' }];
	}
}
