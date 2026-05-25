import type { AiSuggestionParsed } from '../../entities/aiSuggestion';
import { JAVA_ANALYSIS_PROMPT_LOG_LABEL } from '../ai/prompts/javaAnalysisPrompt';
import {
	MODEL_COMPARISON_MODELS,
	type AiAnalysisClient,
	type Clock,
	type ExpectedFinding,
	type ExportedArtifact,
	type FindingMatch,
	type ModelComparisonCaseResult,
	type ModelComparisonMetrics,
	type ModelComparisonModel,
	type ModelComparisonParameters,
	type ModelComparisonRunResult,
	type ModelComparisonSample,
	type ModelComparisonSummaryRow,
	type ResultExporter,
	type SampleRepository,
} from './modelComparison.types';
import { OllamaAnalysisClient } from './ollamaAnalysisClient.service';

export type ModelComparisonRunnerDependencies = {
	sampleRepository: SampleRepository;
	resultExporter: ResultExporter;
	analysisClient?: AiAnalysisClient;
	clock?: Clock;
	models?: ModelComparisonModel[];
};

export type ModelComparisonRunnerInput = {
	baseUrl: string;
	timeoutMs: number;
	extensionVersion: string;
	parameters: ModelComparisonParameters;
	onProgress?: (message: string) => void;
};

export type ModelComparisonRunnerOutput = {
	result: ModelComparisonRunResult;
	artifacts: ExportedArtifact[];
};

const SYSTEM_CLOCK: Clock = {
	now: () => Date.now(),
	isoNow: () => new Date().toISOString(),
};

export class ModelComparisonRunner {
	private readonly sampleRepository: SampleRepository;
	private readonly resultExporter: ResultExporter;
	private readonly analysisClient: AiAnalysisClient;
	private readonly clock: Clock;
	private readonly models: ModelComparisonModel[];

	constructor(deps: ModelComparisonRunnerDependencies) {
		this.sampleRepository = deps.sampleRepository;
		this.resultExporter = deps.resultExporter;
		this.analysisClient = deps.analysisClient ?? new OllamaAnalysisClient();
		this.clock = deps.clock ?? SYSTEM_CLOCK;
		this.models = deps.models ?? MODEL_COMPARISON_MODELS;
	}

	async run(input: ModelComparisonRunnerInput): Promise<ModelComparisonRunnerOutput> {
		const startedAt = this.clock.isoNow();
		const runId = `run-${toFileTimestamp(startedAt)}`;
		const samples = await this.sampleRepository.loadSamples();
		const results: ModelComparisonCaseResult[] = [];

		for (const model of this.models) {
			for (const sample of samples) {
				input.onProgress?.(`Running ${model.id} on ${sample.fileName}`);
				results.push(await this.runCase(model, sample, input));
			}
		}

		const result: ModelComparisonRunResult = {
			runId,
			startedAt,
			finishedAt: this.clock.isoNow(),
			metadata: {
				extensionVersion: input.extensionVersion,
				promptSource: JAVA_ANALYSIS_PROMPT_LOG_LABEL,
				models: this.models,
				parameters: input.parameters,
				samples: samples.map((sample) => ({
					fileName: sample.fileName,
					relativePath: sample.relativePath,
					lineCount: sample.lineCount,
					sha256: sample.sha256,
				})),
			},
			results,
			summary: results.map(toSummaryRow),
		};
		const artifacts = await this.resultExporter.export(result);
		return { result, artifacts };
	}

	private async runCase(
		model: ModelComparisonModel,
		sample: ModelComparisonSample,
		input: ModelComparisonRunnerInput,
	): Promise<ModelComparisonCaseResult> {
		const startedMs = this.clock.now();
		try {
			const analysis = await this.analysisClient.analyze({
				model,
				sample,
				parameters: input.parameters,
				baseUrl: input.baseUrl,
				timeoutMs: input.timeoutMs,
			});
			const responseTimeMs = Math.max(0, this.clock.now() - startedMs);
			const matches = matchFindings({
				suggestions: analysis.suggestions,
				expectedFindings: sample.expectedFindings,
				evaluationMode: sample.evaluationMode,
				lineTolerance: input.parameters.lineTolerance,
				lineCount: sample.lineCount,
			});
			const metrics = calculateMetrics({
				responseTimeMs,
				suggestions: analysis.suggestions,
				matches,
				lineCount: sample.lineCount,
				evaluationMode: sample.evaluationMode,
				expectedFindingCount: sample.expectedFindings.length,
			});
			return {
				modelId: model.id,
				modelLabel: model.label,
				file: sample.fileName,
				evaluationMode: sample.evaluationMode,
				metrics,
				matches,
				batchStats: analysis.batchStats,
				rawResponse: analysis.body,
				errors: analysis.batchStats
					.map((batch) => batch.error)
					.filter((error): error is string => typeof error === 'string' && error.length > 0),
			};
		} catch (error) {
			const responseTimeMs = Math.max(0, this.clock.now() - startedMs);
			const message = error instanceof Error ? error.message : String(error);
			return {
				modelId: model.id,
				modelLabel: model.label,
				file: sample.fileName,
				evaluationMode: sample.evaluationMode,
				metrics: calculateMetrics({
					responseTimeMs,
					suggestions: [],
					matches: [],
					lineCount: sample.lineCount,
					evaluationMode: sample.evaluationMode,
					expectedFindingCount: sample.expectedFindings.length,
				}),
				matches: [],
				batchStats: [],
				rawResponse: '',
				errors: [message],
			};
		}
	}
}

export function matchFindings(input: {
	suggestions: AiSuggestionParsed[];
	expectedFindings: ExpectedFinding[];
	evaluationMode: ModelComparisonSample['evaluationMode'];
	lineTolerance: number;
	lineCount: number;
}): FindingMatch[] {
	if (input.evaluationMode === 'none') {
		return input.suggestions.map((suggestion) => ({
			suggestion,
			rating: 0,
			falsePositive: false,
		}));
	}

	const usedExpectedIds = new Set<string>();
	const tolerance = Math.max(0, Math.floor(input.lineTolerance));

	return input.suggestions.map((suggestion) => {
		if (!isValidLine(suggestion.line, input.lineCount)) {
			return { suggestion, rating: 0, falsePositive: false };
		}
		const suggestionLine = suggestion.line;

		const expected = input.expectedFindings.find(
			(finding) =>
				!usedExpectedIds.has(finding.id) &&
				finding.category === suggestion.category &&
				Math.abs(finding.line - suggestionLine) <= tolerance,
		);

		if (!expected) {
			return { suggestion, rating: 1, falsePositive: true };
		}

		usedExpectedIds.add(expected.id);
		return { suggestion, expected, rating: 5, falsePositive: false };
	});
}

export function calculateMetrics(input: {
	responseTimeMs: number;
	suggestions: AiSuggestionParsed[];
	matches: FindingMatch[];
	lineCount: number;
	evaluationMode?: ModelComparisonSample['evaluationMode'];
	expectedFindingCount?: number;
}): ModelComparisonMetrics {
	const rawSuggestionCount = input.suggestions.length;
	const validSuggestionCount = input.suggestions.filter((suggestion) =>
		isValidLine(suggestion.line, input.lineCount),
	).length;
	const usefulSuggestionCount = input.matches.filter((match) => match.expected !== undefined).length;
	const falsePositiveCount = input.matches.filter((match) => match.falsePositive).length;
	const ratingSum = input.matches.reduce((sum, match) => sum + match.rating, 0);
	const hasGroundTruth = input.evaluationMode !== 'none' && input.expectedFindingCount !== undefined;
	const expectedFindingCount = hasGroundTruth ? input.expectedFindingCount ?? 0 : null;
	const matchedExpectedCount = hasGroundTruth ? usefulSuggestionCount : null;
	const precision = hasGroundTruth ? ratio(usefulSuggestionCount, usefulSuggestionCount + falsePositiveCount) : null;
	const recall = hasGroundTruth ? ratio(usefulSuggestionCount, expectedFindingCount ?? 0) : null;
	const f1Score =
		precision === null || recall === null
			? null
			: precision + recall === 0
				? 0
				: round((2 * precision * recall) / (precision + recall), 4);

	return {
		responseTimeMs: input.responseTimeMs,
		rawSuggestionCount,
		validSuggestionCount,
		invalidSuggestionCount: rawSuggestionCount - validSuggestionCount,
		expectedFindingCount,
		matchedExpectedCount,
		usefulSuggestionCount,
		averageFeedbackRating: rawSuggestionCount === 0 ? 0 : round(ratingSum / rawSuggestionCount, 2),
		falsePositiveCount,
		falsePositiveRate:
			validSuggestionCount === 0 ? 0 : round(falsePositiveCount / validSuggestionCount, 4),
		precision,
		recall,
		f1Score,
	};
}

function isValidLine(line: number | undefined, lineCount: number): line is number {
	return typeof line === 'number' && Number.isInteger(line) && line >= 1 && line <= lineCount;
}

function round(value: number, decimals: number): number {
	const factor = 10 ** decimals;
	return Math.round(value * factor) / factor;
}

function ratio(numerator: number, denominator: number): number {
	if (denominator <= 0) {
		return 0;
	}
	return round(numerator / denominator, 4);
}

function toSummaryRow(result: ModelComparisonCaseResult): ModelComparisonSummaryRow {
	return {
		modelId: result.modelId,
		modelLabel: result.modelLabel,
		file: result.file,
		evaluationMode: result.evaluationMode,
		responseTimeMs: result.metrics.responseTimeMs,
		rawSuggestionCount: result.metrics.rawSuggestionCount,
		validSuggestionCount: result.metrics.validSuggestionCount,
		invalidSuggestionCount: result.metrics.invalidSuggestionCount,
		expectedFindingCount: result.metrics.expectedFindingCount,
		matchedExpectedCount: result.metrics.matchedExpectedCount,
		usefulSuggestionCount: result.metrics.usefulSuggestionCount,
		averageFeedbackRating: result.metrics.averageFeedbackRating,
		falsePositiveCount: result.metrics.falsePositiveCount,
		falsePositiveRate: result.metrics.falsePositiveRate,
		precision: result.metrics.precision,
		recall: result.metrics.recall,
		f1Score: result.metrics.f1Score,
	};
}

function toFileTimestamp(value: string): string {
	return value.replace(/[-:]/g, '').replace(/\.\d{3}Z$/, '').replace('T', '-');
}
