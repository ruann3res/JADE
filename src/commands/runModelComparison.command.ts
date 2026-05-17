import * as vscode from 'vscode';
import { OllamaConfigService } from '../services/config/ollamaConfig.service';
import { DEFAULT_COMPARISON_PARAMETERS } from '../services/modelComparison/modelComparison.types';
import { ModelComparisonRunner } from '../services/modelComparison/modelComparisonRunner.service';
import { FileSystemResultExporter } from '../services/modelComparison/resultExporter.service';
import { FileSampleRepository } from '../services/modelComparison/sampleRepository.service';

export async function runModelComparisonCommand(input: {
	context: vscode.ExtensionContext;
	outputChannel: vscode.OutputChannel;
}): Promise<void> {
	const workspaceRoot = resolveWorkspaceRoot();
	if (!workspaceRoot) {
		vscode.window.showWarningMessage('Open a workspace folder before running the UDIA model comparison.');
		return;
	}

	const runner = new ModelComparisonRunner({
		sampleRepository: new FileSampleRepository(input.context.extensionUri.fsPath),
		resultExporter: new FileSystemResultExporter(workspaceRoot),
	});
	const ollamaConfig = new OllamaConfigService().read();

	await vscode.window.withProgress(
		{
			location: vscode.ProgressLocation.Notification,
			title: 'UDIA: model comparison',
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
			vscode.window.showInformationMessage(
				`UDIA: model comparison complete. Results saved to ${workspaceRoot}/model-comparison-results/${output.result.runId}.csv`,
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
