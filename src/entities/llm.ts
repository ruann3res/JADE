export enum SonnarAiModel {
	DeepseekCoder = 'deepseek-coder:6.7b',
	Qwen25Coder = 'qwen2.5-coder:7b',
}

export const SONNAR_AI_MODEL_LABELS: Record<SonnarAiModel, string> = {
	[SonnarAiModel.DeepseekCoder]: 'Deepseek-Coder (6.7B, Ollama)',
	[SonnarAiModel.Qwen25Coder]: 'Qwen2.5-Coder (7B, Ollama)',
};

export function isSonnarAiModel(value: string): value is SonnarAiModel {
	return (Object.values(SonnarAiModel) as string[]).includes(value);
}

/**
 * Resolves the model id sent to Ollama.
 * Any non-empty string is accepted (locally installed models); empty falls back to the default.
 */
export function resolveOllamaModelId(value: string): string {
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : SonnarAiModel.DeepseekCoder;
}

/** @deprecated Use {@link resolveOllamaModelId} */
export function normalizeSonnarAiModel(value: string): string {
	return resolveOllamaModelId(value);
}
