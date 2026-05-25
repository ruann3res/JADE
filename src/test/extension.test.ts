import * as assert from 'assert';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

import * as vscode from 'vscode';
import { createJavaSourceBatches } from '../services/ai/aiBatchAnalysis.service';
import { AiExecutionReportExporter, type AiExecutionReport } from '../services/ai/aiExecutionReport.service';
import { buildJavaAnalysisChatMessages, parseAiSuggestionsJson } from '../services/ai/promptBuilder.service';
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
import { buildSwallowedExceptionFallbackFix, JADE_GENERATE_FIX_COMMAND } from '../commands/generateFix.command';
import { parseAiFixJson } from '../services/ai/aiFixGeneration.service';
import { JADE_AI_DIAGNOSTIC_SOURCE } from '../services/ai/aiDiagnosticMapper.service';
import { buildAiExecutionHtml } from '../services/webview/aiExecutionPanel.service';
import { buildModelComparisonHtml } from '../services/webview/modelComparisonPanel.service';
import { JadeCodeActionProvider } from '../services/vscode/jadeCodeActionProvider.service';
import { buildWorkspaceEdit, JADE_AI_FIX_DATA_KEY } from '../services/vscode/jadeFixWorkspaceEdit.service';

suite('Extension Test Suite', () => {
	vscode.window.showInformationMessage('Start all tests.');

	test('Sample test', () => {
		assert.strictEqual(-1, [1, 2, 3].indexOf(5));
		assert.strictEqual(-1, [1, 2, 3].indexOf(0));
	});

	test('buildJavaAnalysisChatMessages embeds <ragContext> and never <sonarContext>', () => {
		const messages = buildJavaAnalysisChatMessages({
			fileName: 'Probe.java',
			javaSource: 'class Probe {}',
			ragContext: 'Local Java heuristics (retrieval hints only)',
		});

		const userMessage = messages[1]?.content ?? '';
		assert.ok(userMessage.includes('<ragContext>'));
		assert.ok(!userMessage.includes('<sonarContext>'));
		assert.ok(userMessage.includes('Local Java heuristics'));
	});

	test('parseAiSuggestionsJson accepts string ranges as the anchor line', () => {
		const parsed = parseAiSuggestionsJson('{"suggestions":[{"id":"1","line":"108-134","category":"Security","summary":"SQL injection","detail":"Use prepared statements."}]}');

		assert.strictEqual(parsed.structuredJsonEnvelope, true);
		assert.strictEqual(parsed.suggestions.length, 1);
		assert.strictEqual(parsed.suggestions[0].line, 108);
		assert.strictEqual(parsed.suggestions[0].category, 'security');
	});

	test('parseAiSuggestionsJson parses optional structured fixes', () => {
		const parsed = parseAiSuggestionsJson(
			JSON.stringify({
				suggestions: [
					{
						id: 's1',
						line: 2,
						category: 'codeSmell',
						summary: 'Replace a line',
						detail: 'Replace a line.',
						fixKind: 'replaceLine',
						newLineText: 'String value = readValue();',
					},
					{
						id: 's2',
						line: 4,
						category: 'bug',
						summary: 'Replace a range',
						detail: 'Replace a range.',
						fixKind: 'replaceRange',
						startLine: 4,
						startColumn: 3,
						endLine: 4,
						endColumn: 8,
						newText: 'safeCall',
					},
					{
						id: 's3',
						line: 6,
						category: 'duplication',
						summary: 'No fix',
						detail: 'No fix.',
					},
				],
			}),
		);

		assert.deepStrictEqual(parsed.suggestions[0].fix, {
			kind: 'replaceLine',
			line: 2,
			newLineText: 'String value = readValue();',
		});
		assert.deepStrictEqual(parsed.suggestions[1].fix, {
			kind: 'replaceRange',
			startLine: 4,
			startColumn: 3,
			endLine: 4,
			endColumn: 8,
			newText: 'safeCall',
		});
		assert.strictEqual(parsed.suggestions[2].fix, undefined);
	});

	test('parseAiFixJson parses generated fix responses', () => {
		assert.deepStrictEqual(
			parseAiFixJson('{"fixKind":"replaceLine","line":2,"newLineText":"        return \\"\\";"}'),
			{
				kind: 'replaceLine',
				line: 2,
				newLineText: '        return "";',
			},
		);
		assert.deepStrictEqual(
			parseAiFixJson(
				'{"fixKind":"replaceRange","startLine":2,"startColumn":9,"endLine":2,"endColumn":21,"newText":"return Optional.empty();"}',
			),
			{
				kind: 'replaceRange',
				startLine: 2,
				startColumn: 9,
				endLine: 2,
				endColumn: 21,
				newText: 'return Optional.empty();',
			},
		);
		assert.strictEqual(parseAiFixJson('{"fixKind":"none"}'), undefined);
	});

	test('parseAiFixJson normalizes replaceRange responses without columns when document is available', () => {
		const document = createMockDocument([
			'        try {',
			'            validateSeed(seed);',
			'        } catch (IllegalArgumentException ex) {',
			'        }',
			'',
		]);

		assert.deepStrictEqual(
			parseAiFixJson(
				'{"fixKind":"replaceRange","startLine":3,"endLine":4,"newText":"\\n        } catch (IllegalArgumentException ex) {\\n            throw new IllegalStateException(\\"Falha ao executar processamento pesado\\", ex);\\n        }\\n"}',
				document,
			),
			{
				kind: 'replaceRange',
				startLine: 3,
				startColumn: 1,
				endLine: 4,
				endColumn: 10,
				newText:
					'        } catch (IllegalArgumentException ex) {\n            throw new IllegalStateException("Falha ao executar processamento pesado", ex);\n        }',
			},
		);
	});

	test('buildWorkspaceEdit converts replaceLine fixes to VS Code ranges', () => {
		const document = createMockDocument(['alpha();', 'beta();', 'gamma();']);
		const edit = buildWorkspaceEdit(document, {
			kind: 'replaceLine',
			line: 2,
			newLineText: 'delta();',
		});

		const textEdit = singleTextEdit(edit);
		assert.strictEqual(textEdit.newText, 'delta();');
		assert.strictEqual(textEdit.range.start.line, 1);
		assert.strictEqual(textEdit.range.start.character, 0);
		assert.strictEqual(textEdit.range.end.line, 1);
		assert.strictEqual(textEdit.range.end.character, 'beta();'.length);
	});

	test('buildWorkspaceEdit converts replaceRange fixes to VS Code ranges', () => {
		const document = createMockDocument(['alpha();', 'beta();', 'gamma();']);
		const edit = buildWorkspaceEdit(document, {
			kind: 'replaceRange',
			startLine: 2,
			startColumn: 1,
			endLine: 2,
			endColumn: 5,
			newText: 'delta',
		});

		const textEdit = singleTextEdit(edit);
		assert.strictEqual(textEdit.newText, 'delta');
		assert.strictEqual(textEdit.range.start.line, 1);
		assert.strictEqual(textEdit.range.start.character, 0);
		assert.strictEqual(textEdit.range.end.line, 1);
		assert.strictEqual(textEdit.range.end.character, 4);
	});

	test('buildWorkspaceEdit rejects unsafe catch range fixes with placeholder handling', () => {
		const document = createMockDocument([
			'        try {',
			'            validateSeed(seed);',
			'        } catch (IllegalArgumentException ex) {',
			'        }',
		]);
		const edit = buildWorkspaceEdit(document, {
			kind: 'replaceRange',
			startLine: 3,
			startColumn: 5,
			endLine: 4,
			endColumn: 4,
			newText: 'catch(IllegalArgumentException ex) {\n    // Handle the exception\n}',
		});

		assert.strictEqual(edit, undefined);
	});

	test('buildWorkspaceEdit allows safe whole catch block replacement', () => {
		const document = createMockDocument([
			'        try {',
			'            validateSeed(seed);',
			'        } catch (IllegalArgumentException ex) {',
			'        }',
		]);
		const edit = buildWorkspaceEdit(document, {
			kind: 'replaceRange',
			startLine: 3,
			startColumn: 1,
			endLine: 4,
			endColumn: 10,
			newText:
				'        } catch (IllegalArgumentException ex) {\n            throw new IllegalStateException("Falha ao executar processamento pesado", ex);\n        }',
		});

		const textEdit = singleTextEdit(edit);
		assert.ok(textEdit.newText.includes('throw new IllegalStateException'));
		assert.strictEqual(textEdit.range.start.line, 2);
		assert.strictEqual(textEdit.range.start.character, 0);
		assert.strictEqual(textEdit.range.end.line, 3);
		assert.strictEqual(textEdit.range.end.character, 9);
	});

	test('buildSwallowedExceptionFallbackFix creates a safe fix for empty catch blocks', () => {
		const document = createMockDocument([
			'        try {',
			'            validateSeed(seed);',
			'        } catch (IllegalArgumentException ex) {',
			'        }',
		]);

		assert.deepStrictEqual(
			buildSwallowedExceptionFallbackFix(document, {
				message: '[AI] Swallowed Exception',
				line: 3,
				detail: 'The exception is caught but not handled.',
				code: 'ai.codeSmell',
			}),
			{
				kind: 'replaceRange',
				startLine: 3,
				startColumn: 1,
				endLine: 4,
				endColumn: 10,
				newText:
					'        } catch (IllegalArgumentException ex) {\n            throw new IllegalStateException("Failed to execute operation", ex);\n        }',
			},
		);
	});

	test('buildWorkspaceEdit ignores fixes outside the document', () => {
		const document = createMockDocument(['alpha();']);
		const edit = buildWorkspaceEdit(document, {
			kind: 'replaceLine',
			line: 2,
			newLineText: 'beta();',
		});

		assert.strictEqual(edit, undefined);
	});

	test('buildWorkspaceEdit rejects comment-only replacements for Java structural lines', () => {
		const document = createMockDocument([
			'    public String getUserById(String id) {',
			'        return null;',
			'    }',
		]);
		const edit = buildWorkspaceEdit(document, {
			kind: 'replaceLine',
			line: 1,
			newLineText: '// Return a meaningful value instead of null',
		});

		assert.strictEqual(edit, undefined);
	});

	test('buildWorkspaceEdit allows replacing the actual return statement', () => {
		const document = createMockDocument([
			'    public String getUserById(String id) {',
			'        return null;',
			'    }',
		]);
		const edit = buildWorkspaceEdit(document, {
			kind: 'replaceLine',
			line: 2,
			newLineText: '        return "";',
		});

		const textEdit = singleTextEdit(edit);
		assert.strictEqual(textEdit.newText, '        return "";');
		assert.strictEqual(textEdit.range.start.line, 1);
		assert.strictEqual(textEdit.range.end.character, '        return null;'.length);
	});

	test('JadeCodeActionProvider returns a Quick Fix for JADE diagnostics with structured fixes', () => {
		const document = createMockDocument(['alpha();', 'beta();']);
		const diagnostic = new vscode.Diagnostic(
			new vscode.Range(1, 0, 1, 'beta();'.length),
			'[AI] Replace beta',
			vscode.DiagnosticSeverity.Information,
		);
		diagnostic.source = JADE_AI_DIAGNOSTIC_SOURCE;
		(diagnostic as vscode.Diagnostic & { data?: Record<string, unknown> }).data = {
			[JADE_AI_FIX_DATA_KEY]: {
				kind: 'replaceLine',
				line: 2,
				newLineText: 'delta();',
			},
		};

		const actions = new JadeCodeActionProvider().provideCodeActions(
			document,
			new vscode.Range(0, 0, 0, 0),
			{
				diagnostics: [diagnostic],
				only: vscode.CodeActionKind.QuickFix.append('jade'),
				triggerKind: vscode.CodeActionTriggerKind.Invoke,
			},
			{} as vscode.CancellationToken,
		);

		assert.strictEqual(actions.length, 2);
		assert.strictEqual(actions[0].title, 'JADE: Apply suggested fix');
		assert.strictEqual(actions[0].kind?.value, vscode.CodeActionKind.QuickFix.value);
		assert.strictEqual(actions[0].diagnostics?.[0], diagnostic);
		assert.ok(actions[0].edit);
		assert.strictEqual(actions[1].title, 'JADE: Generate fix with AI');
		assert.strictEqual(actions[1].command?.command, JADE_GENERATE_FIX_COMMAND);
	});

	test('JadeCodeActionProvider can generate fixes for JADE diagnostics without structured fixes', () => {
		const document = createMockDocument(['alpha();']);
		const diagnostic = new vscode.Diagnostic(
			new vscode.Range(0, 0, 0, 'alpha();'.length),
			'[AI] Text-only suggestion',
			vscode.DiagnosticSeverity.Information,
		);
		diagnostic.source = JADE_AI_DIAGNOSTIC_SOURCE;

		const actions = new JadeCodeActionProvider().provideCodeActions(
			document,
			new vscode.Range(0, 0, 0, 0),
			{
				diagnostics: [diagnostic],
				only: vscode.CodeActionKind.QuickFix,
				triggerKind: vscode.CodeActionTriggerKind.Invoke,
			},
			{} as vscode.CancellationToken,
		);

		assert.strictEqual(actions.length, 1);
		assert.strictEqual(actions[0].title, 'JADE: Generate fix with AI');
		assert.strictEqual(actions[0].command?.command, JADE_GENERATE_FIX_COMMAND);
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
			evaluationMode: 'groundTruth',
			expectedFindingCount: 1,
		});

		assert.strictEqual(metrics.responseTimeMs, 123);
		assert.strictEqual(metrics.rawSuggestionCount, 3);
		assert.strictEqual(metrics.validSuggestionCount, 2);
		assert.strictEqual(metrics.invalidSuggestionCount, 1);
		assert.strictEqual(metrics.usefulSuggestionCount, 1);
		assert.strictEqual(metrics.falsePositiveCount, 1);
		assert.strictEqual(metrics.falsePositiveRate, 0.5);
		assert.strictEqual(metrics.averageFeedbackRating, 2);
		assert.strictEqual(metrics.expectedFindingCount, 1);
		assert.strictEqual(metrics.matchedExpectedCount, 1);
		assert.strictEqual(metrics.precision, 0.5);
		assert.strictEqual(metrics.recall, 1);
		assert.strictEqual(metrics.f1Score, 0.6667);
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

		const metrics = calculateMetrics({
			responseTimeMs: 50,
			suggestions: [{ id: 's1', line: 3, category: 'bug', summary: 'Open file finding', detail: 'Not evaluated.' }],
			matches,
			lineCount: 10,
			evaluationMode: 'none',
			expectedFindingCount: 0,
		});
		assert.strictEqual(metrics.expectedFindingCount, null);
		assert.strictEqual(metrics.precision, null);
		assert.strictEqual(metrics.recall, null);
		assert.strictEqual(metrics.f1Score, null);
	});

	test('FileSystemResultExporter writes JSON and CSV artifacts', async () => {
		const root = await fs.mkdtemp(path.join(os.tmpdir(), 'jade-model-comparison-'));
		const exporter = new FileSystemResultExporter(root);
		const result = buildMinimalRunResult('run-20260517-120000');

		const artifacts = await exporter.export(result);
		const csvPath = path.join(root, 'model-comparison-results', 'run-20260517-120000.csv');
		const latestJsonPath = path.join(root, 'model-comparison-results', 'latest.json');
		const csv = await fs.readFile(csvPath, 'utf-8');
		const latestJson = JSON.parse(await fs.readFile(latestJsonPath, 'utf-8')) as ModelComparisonRunResult;

		assert.strictEqual(artifacts.length, 4);
		assert.ok(csv.includes('responseTimeMs'));
		assert.ok(csv.includes('precision'));
		assert.ok(csv.includes('deepseek-coder:6.7b'));
		assert.strictEqual(latestJson.runId, result.runId);
	});

	test('AiExecutionReportExporter writes latest report artifacts', async () => {
		const root = await fs.mkdtemp(path.join(os.tmpdir(), 'jade-ai-report-'));
		const exporter = new AiExecutionReportExporter(root);
		const report = buildMinimalAiExecutionReport();

		const artifacts = await exporter.export(report);
		const latestPath = path.join(root, 'jade-ai-reports', 'analyze', 'latest.json');
		const latest = JSON.parse(await fs.readFile(latestPath, 'utf-8')) as AiExecutionReport;

		assert.strictEqual(artifacts.length, 2);
		assert.strictEqual(latest.reportId, report.reportId);
		assert.strictEqual(latest.kind, 'analyze');
	});

	test('webview html includes scientific and AI execution report data', () => {
		const comparisonHtml = buildModelComparisonHtml('vscode-resource:', 'nonce', buildMinimalRunResult('run-20260517-120000'));
		const aiHtml = buildAiExecutionHtml('vscode-resource:', 'nonce', buildMinimalAiExecutionReport());

		assert.ok(comparisonHtml.includes('Model comparison analysis'));
		assert.ok(comparisonHtml.includes('deepseek-coder:6.7b'));
		assert.ok(comparisonHtml.includes('Precision'));
		assert.ok(aiHtml.includes('AI execution report'));
		assert.ok(aiHtml.includes('Test.java'));
		assert.ok(aiHtml.includes('Analysis traceability'));
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
		ragEnabled: true,
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
				evaluationMode: 'groundTruth',
				responseTimeMs: 10,
				rawSuggestionCount: 1,
				validSuggestionCount: 1,
				invalidSuggestionCount: 0,
				expectedFindingCount: 1,
				matchedExpectedCount: 1,
				usefulSuggestionCount: 1,
				averageFeedbackRating: 5,
				falsePositiveCount: 0,
				falsePositiveRate: 0,
				precision: 1,
				recall: 1,
				f1Score: 1,
			},
		],
	};
}

function buildMinimalAiExecutionReport(): AiExecutionReport {
	return {
		reportId: 'analyze-20260517-120000',
		kind: 'analyze',
		status: 'success',
		startedAt: '2026-05-17T12:00:00.000Z',
		finishedAt: '2026-05-17T12:00:01.000Z',
		durationMs: 1000,
		modelId: 'deepseek-coder:6.7b',
		fileName: 'Test.java',
		filePath: '/tmp/jade/Test.java',
		summary: 'Parsed 1 suggestion.',
		errors: [],
		rawResponse: '{"suggestions":[]}',
		analysis: {
			totalSuggestions: 1,
			keptSuggestions: 1,
			droppedInvalidLine: 0,
			truncatedForUi: 0,
			diagnosticCount: 1,
			structuredFixCount: 0,
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
			suggestions: [
				{ id: 's1', line: 1, category: 'bug', summary: 'Bug', detail: 'Bug detail.' },
			],
		},
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

function createMockDocument(lines: string[]): vscode.TextDocument {
	return {
		uri: vscode.Uri.file('/tmp/jade/Test.java'),
		lineCount: lines.length,
		lineAt(line: number): vscode.TextLine {
			const text = lines[line];
			return {
				lineNumber: line,
				text,
				range: new vscode.Range(line, 0, line, text.length),
				rangeIncludingLineBreak: new vscode.Range(line, 0, line, text.length),
				firstNonWhitespaceCharacterIndex: text.search(/\S|$/),
				isEmptyOrWhitespace: text.trim().length === 0,
			};
		},
	} as vscode.TextDocument;
}

function singleTextEdit(edit: vscode.WorkspaceEdit | undefined): vscode.TextEdit {
	assert.ok(edit);
	const entries = edit.entries();
	assert.strictEqual(entries.length, 1);
	assert.strictEqual(entries[0][1].length, 1);
	return entries[0][1][0];
}
