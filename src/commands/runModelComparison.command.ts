import * as vscode from 'vscode';
import { OllamaConfigService } from '../services/config/ollamaConfig.service';
import { RagConfigService } from '../services/config/ragConfig.service';
import { DEFAULT_COMPARISON_PARAMETERS } from '../services/modelComparison/modelComparison.types';
import { ModelComparisonRunner } from '../services/modelComparison/modelComparisonRunner.service';
import { OllamaAnalysisClient } from '../services/modelComparison/ollamaAnalysisClient.service';
import { FileSystemResultExporter } from '../services/modelComparison/resultExporter.service';
import { FileSampleRepository } from '../services/modelComparison/sampleRepository.service';
import { createRagContextService } from '../services/rag';
import { SetupStateService } from '../services/setup';
import { ModelComparisonPanelService } from '../services/webview/modelComparisonPanel.service';

export async function runModelComparisonCommand(input: {
	context: vscode.ExtensionContext;
	outputChannel: vscode.OutputChannel;
}): Promise<void> {
	const workspaceRoot = resolveWorkspaceRoot();
	if (!workspaceRoot) {
		vscode.window.showWarningMessage('Open a workspace folder before running the JADE model comparison.');
		return;
	}

	const ollamaConfig = new OllamaConfigService().read();
	const ragConfig = new RagConfigService().read();
	const setupState = new SetupStateService(input.context);
	const ragContextService = createRagContextService({ ragConfig, ollamaConfig, setupState });
	const runner = new ModelComparisonRunner({
		sampleRepository: new FileSampleRepository(input.context.extensionUri.fsPath),
		resultExporter: new FileSystemResultExporter(workspaceRoot),
		analysisClient: new OllamaAnalysisClient({ ragContextService }),
	});

	await vscode.window.withProgress(
		{
			location: vscode.ProgressLocation.Notification,
			title: 'JADE: model comparison',
			cancellable: false,
		},
		async (progress) => {
			const output = await runner.run({
				baseUrl: ollamaConfig.baseUrl,
				timeoutMs: ollamaConfig.timeoutMs,
				extensionVersion: readExtensionVersion(input.context),
				parameters: DEFAULT_COMPARISON_PARAMETERS,
				onProgress: (message) => {
					progress.report({ message });
					input.outputChannel.appendLine(`[Model comparison] ${message}`);
				},
			});
			input.outputChannel.appendLine(`[Model comparison] Completed run ${output.result.runId}`);
			for (const artifact of output.artifacts) {
				input.outputChannel.appendLine(`[Model comparison] ${artifact.format.toUpperCase()}: ${artifact.path}`);
			}
			const panelService = new ModelComparisonPanelService();
			const panel = panelService.create(input.context);
			panelService.fill(panel, output.result);
			vscode.window.showInformationMessage(
				`JADE: model comparison complete. Results saved to ${workspaceRoot}/model-comparison-results/${output.result.runId}.csv`,
			);
		},
	);
}

function readExtensionVersion(context: vscode.ExtensionContext): string {
	const packageJson = context.extension.packageJSON as { version?: unknown };
	return typeof packageJson.version === 'string' ? packageJson.version : 'unknown';
}

function resolveWorkspaceRoot(): string | undefined {
	return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}
