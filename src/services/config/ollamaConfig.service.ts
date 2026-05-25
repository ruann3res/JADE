import * as vscode from 'vscode';
import { resolveOllamaModelId } from '../../entities/llm';
import { DEFAULT_AI_BATCH_MAX_LINES, DEFAULT_AI_BATCH_OVERLAP_LINES } from '../ai/aiBatchAnalysis.service';
import { DEFAULT_OLLAMA_TIMEOUT_MS } from '../ai/ollama.service';

export type OllamaRuntimeConfig = {
	baseUrl: string;
	modelId: string;
	timeoutMs: number;
	batchMaxLines: number;
	batchOverlapLines: number;
};

export class OllamaConfigService {
	read(): OllamaRuntimeConfig {
		const config = vscode.workspace.getConfiguration('jade');
		const baseUrl = String(config.get('ollama.baseUrl') ?? 'http://127.0.0.1:11434');
		const requestTimeoutMs = Number(config.get('ollama.requestTimeoutMs'));
		const modelSetting = String(config.get('ollama.model') ?? '');
		const batchMaxLines = Number(config.get('ai.batchMaxLines'));
		const batchOverlapLines = Number(config.get('ai.batchOverlapLines'));
		const modelId = resolveOllamaModelId(modelSetting);

		return {
			baseUrl,
			modelId,
			timeoutMs: Number.isFinite(requestTimeoutMs) && requestTimeoutMs > 0
				? requestTimeoutMs
				: DEFAULT_OLLAMA_TIMEOUT_MS,
			batchMaxLines: Number.isInteger(batchMaxLines) && batchMaxLines > 0
				? batchMaxLines
				: DEFAULT_AI_BATCH_MAX_LINES,
			batchOverlapLines: Number.isInteger(batchOverlapLines) && batchOverlapLines >= 0
				? batchOverlapLines
				: DEFAULT_AI_BATCH_OVERLAP_LINES,
		};
	}
}
