import { runAiAnalysisInBatches } from '../ai/aiBatchAnalysis.service';
import type {
	AiAnalysisClient,
	ModelComparisonAnalysisInput,
	ModelComparisonAnalysisResult,
} from './modelComparison.types';

export class OllamaAnalysisClient implements AiAnalysisClient {
	async analyze(input: ModelComparisonAnalysisInput): Promise<ModelComparisonAnalysisResult> {
		return runAiAnalysisInBatches({
			baseUrl: input.baseUrl,
			modelId: input.model.id,
			fileName: input.sample.fileName,
			javaSource: input.sample.source,
			sonarContext: '',
			ollamaRequestOptions: {
				timeoutMs: input.timeoutMs,
				modelOptions: {
					temperature: input.parameters.temperature,
					num_predict: input.parameters.numPredict,
				},
			},
			batching: {
				maxLines: input.parameters.batchMaxLines,
				overlapLines: input.parameters.batchOverlapLines,
			},
		});
	}
}
