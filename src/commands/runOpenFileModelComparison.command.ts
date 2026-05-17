import * as path from 'path';
import * as vscode from 'vscode';
import { OllamaConfigService } from '../services/config/ollamaConfig.service';
import { RagConfigService } from '../services/config/ragConfig.service';
import {
	DEFAULT_COMPARISON_PARAMETERS,
	type ModelComparisonSample,
} from '../services/modelComparison/modelComparison.types';
import { ModelComparisonRunner } from '../services/modelComparison/modelComparisonRunner.service';
import { OllamaAnalysisClient } from '../services/modelComparison/ollamaAnalysisClient.service';
import { FileSystemResultExporter } from '../services/modelComparison/resultExporter.service';
import { InMemorySampleRepository, sha256 } from '../services/modelComparison/sampleRepository.service';
import { createRagContextService } from '../services/rag';
import { SetupStateService } from '../services/setup';
import { LanguageGuardService } from '../services/vscode/languageGuard.service';

export async function runOpenFileModelComparisonCommand(input: {
	context: vscode.ExtensionContext;
	outputChannel: vscode.OutputChannel;
	resource?: vscode.Uri;
}): Promise<void> {
	const workspaceRoot = resolveWorkspaceRoot();
	if (!workspaceRoot) {
		vscode.window.showWarningMessage('Open a workspace folder before running the UDIA open-file model comparison.');
		return;
	}

	const document = await resolveDocument(input.resource);
	if (!document) {
		vscode.window.showWarningMessage('Open a Java file before running the UDIA open-file model comparison.');
		return;
	}

	const languageGuard = new LanguageGuardService();
	if (!languageGuard.isJava(document)) {
		vscode.window.showWarningMessage(languageGuard.supportedLanguagesMessage());
		return;
	}

	const sample = buildSampleFromDocument(document, workspaceRoot);
	const ollamaConfig = new OllamaConfigService().read();
	const ragConfig = new RagConfigService().read();
	const setupState = new SetupStateService(input.context);
	const ragContextService = createRagContextService({ ragConfig, ollamaConfig, setupState });
	const runner = new ModelComparisonRunner({
		sampleRepository: new InMemorySampleRepository([sample]),
		resultExporter: new FileSystemResultExporter(workspaceRoot, 'model-comparison-results/open-file'),
		analysisClient: new OllamaAnalysisClient({ ragContextService }),
	});

	await vscode.window.withProgress(
		{
			location: vscode.ProgressLocation.Notification,
			title: 'UDIA: open-file model comparison',
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
					input.outputChannel.appendLine(`[Open-file model comparison] ${message}`);
				},
			});
			input.outputChannel.appendLine(`[Open-file model comparison] Completed run ${output.result.runId}`);
			for (const artifact of output.artifacts) {
				input.outputChannel.appendLine(
					`[Open-file model comparison] ${artifact.format.toUpperCase()}: ${artifact.path}`,
				);
			}
			vscode.window.showInformationMessage(
				`UDIA: open-file comparison complete. Results saved to ${workspaceRoot}/model-comparison-results/open-file/${output.result.runId}.csv`,
			);
		},
	);
}

async function resolveDocument(resource?: vscode.Uri): Promise<vscode.TextDocument | undefined> {
	if (resource) {
		return vscode.workspace.openTextDocument(resource);
	}
	return vscode.window.activeTextEditor?.document;
}

function buildSampleFromDocument(document: vscode.TextDocument, workspaceRoot: string): ModelComparisonSample {
	const source = document.getText();
	const fileName = path.basename(document.uri.fsPath);
	const relativePath = path.relative(workspaceRoot, document.uri.fsPath) || fileName;
	return {
		fileName,
		relativePath,
		source,
		lineCount: document.lineCount,
		sha256: sha256(source),
		evaluationMode: 'none',
		expectedFindings: [],
	};
}

function readExtensionVersion(context: vscode.ExtensionContext): string {
	const packageJson = context.extension.packageJSON as { version?: unknown };
	return typeof packageJson.version === 'string' ? packageJson.version : 'unknown';
}

function resolveWorkspaceRoot(): string | undefined {
	return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}
