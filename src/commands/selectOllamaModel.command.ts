import * as vscode from 'vscode';
import { SONNAR_AI_MODEL_LABELS, SonnarAiModel } from '../entities/llm';

type ModelQuickPickItem = vscode.QuickPickItem & { pickId: SonnarAiModel };

export async function selectOllamaModelCommand(): Promise<void> {
	const presetItems: ModelQuickPickItem[] = (Object.values(SonnarAiModel) as SonnarAiModel[]).map((value) => ({
		label: SONNAR_AI_MODEL_LABELS[value],
		description: value,
		pickId: value,
	}));

	const picked = await vscode.window.showQuickPick(presetItems, {
		title: 'JADE: Ollama model',
		placeHolder: 'Choose the model used for analysis',
	});

	if (!picked) {
		return;
	}

	const config = vscode.workspace.getConfiguration('jade');
	await config.update('ollama.model', picked.pickId, vscode.ConfigurationTarget.Global);
	vscode.window.showInformationMessage(`JADE: active Ollama model — ${picked.pickId}`);
}
