import type { AiSuggestionParsed } from '../../entities/aiSuggestion';
import type { FeedbackCategory } from '../../entities/feedback';
import { SONNAR_AI_MODEL_LABELS, SonnarAiModel } from '../../entities/llm';
import type { AiBatchPromptDebug, AiBatchStats } from '../ai/aiBatchAnalysis.service';

export type ModelComparisonModel = {
	id: string;
	label: string;
};

export type ExpectedFinding = {
	id: string;
	file: string;
	line: number;
	category: FeedbackCategory;
	summary: string;
	rationale: string;
};

export type ModelComparisonSample = {
	fileName: string;
	relativePath: string;
	source: string;
	lineCount: number;
	sha256: string;
	evaluationMode: 'groundTruth' | 'none';
	expectedFindings: ExpectedFinding[];
};

export type ModelComparisonParameters = {
	temperature: number;
	numPredict: number;
	batchMaxLines: number;
	batchOverlapLines: number;
	lineTolerance: number;
	ragEnabled: boolean;
};

export type ModelComparisonAnalysisInput = {
	model: ModelComparisonModel;
	sample: ModelComparisonSample;
	parameters: ModelComparisonParameters;
	baseUrl: string;
	timeoutMs: number;
};

export type ModelComparisonAnalysisResult = {
	suggestions: AiSuggestionParsed[];
	body: string;
	batchStats: AiBatchStats[];
	promptDebug: AiBatchPromptDebug;
};

export type FindingMatch = {
	suggestion: AiSuggestionParsed;
	expected?: ExpectedFinding;
	rating: number;
	falsePositive: boolean;
};

export type ModelComparisonMetrics = {
	responseTimeMs: number;
	rawSuggestionCount: number;
	validSuggestionCount: number;
	invalidSuggestionCount: number;
	expectedFindingCount: number | null;
	matchedExpectedCount: number | null;
	usefulSuggestionCount: number;
	averageFeedbackRating: number;
	falsePositiveCount: number;
	falsePositiveRate: number;
	precision: number | null;
	recall: number | null;
	f1Score: number | null;
};

export type ModelComparisonCaseResult = {
	modelId: string;
	modelLabel: string;
	file: string;
	evaluationMode: ModelComparisonSample['evaluationMode'];
	metrics: ModelComparisonMetrics;
	matches: FindingMatch[];
	batchStats: AiBatchStats[];
	rawResponse: string;
	errors: string[];
};

export type ModelComparisonSummaryRow = {
	modelId: string;
	modelLabel: string;
	file: string;
	evaluationMode: ModelComparisonSample['evaluationMode'];
	responseTimeMs: number;
	rawSuggestionCount: number;
	validSuggestionCount: number;
	invalidSuggestionCount: number;
	expectedFindingCount: number | null;
	matchedExpectedCount: number | null;
	usefulSuggestionCount: number;
	averageFeedbackRating: number;
	falsePositiveCount: number;
	falsePositiveRate: number;
	precision: number | null;
	recall: number | null;
	f1Score: number | null;
};

export type ModelComparisonRunResult = {
	runId: string;
	startedAt: string;
	finishedAt: string;
	metadata: {
		extensionVersion: string;
		promptSource: string;
		models: ModelComparisonModel[];
		parameters: ModelComparisonParameters;
		samples: Array<Pick<ModelComparisonSample, 'fileName' | 'relativePath' | 'lineCount' | 'sha256'>>;
	};
	results: ModelComparisonCaseResult[];
	summary: ModelComparisonSummaryRow[];
};

export type ExportedArtifact = {
	format: 'json' | 'csv';
	path: string;
};

export type SampleRepository = {
	loadSamples(): Promise<ModelComparisonSample[]>;
};

export type AiAnalysisClient = {
	analyze(input: ModelComparisonAnalysisInput): Promise<ModelComparisonAnalysisResult>;
};

export type ResultExporter = {
	export(result: ModelComparisonRunResult): Promise<ExportedArtifact[]>;
};

export type Clock = {
	now(): number;
	isoNow(): string;
};

export const DEFAULT_COMPARISON_PARAMETERS: ModelComparisonParameters = {
	temperature: 0.15,
	numPredict: 4096,
	batchMaxLines: 180,
	batchOverlapLines: 20,
	lineTolerance: 2,
	ragEnabled: true,
};

export const MODEL_COMPARISON_MODELS: ModelComparisonModel[] = [
	{
		id: SonnarAiModel.DeepseekCoder,
		label: SONNAR_AI_MODEL_LABELS[SonnarAiModel.DeepseekCoder],
	},
	{
		id: SonnarAiModel.Qwen25Coder,
		label: SONNAR_AI_MODEL_LABELS[SonnarAiModel.Qwen25Coder],
	},
];
