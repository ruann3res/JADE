import * as fs from 'fs/promises';
import * as path from 'path';
import * as vscode from 'vscode';

const SAMPLES_SOURCE_DIRECTORY = 'samples/model-comparison';
const TARGET_DIRECTORY = 'model-comparison-samples';

export async function exportModelComparisonSamplesCommand(input: {
	context: vscode.ExtensionContext;
	outputChannel: vscode.OutputChannel;
}): Promise<void> {
	const workspaceRoot = resolveWorkspaceRoot();
	if (!workspaceRoot) {
		vscode.window.showWarningMessage('Open a workspace folder before exporting UDIA model comparison samples.');
		return;
	}

	const extensionRoot = input.context.extensionUri.fsPath;
	const sourceSamples = path.join(extensionRoot, SAMPLES_SOURCE_DIRECTORY);

	if (!(await exists(sourceSamples))) {
		const message = `UDIA: samples directory not found at ${sourceSamples}. Cannot export.`;
		input.outputChannel.appendLine(`[Model comparison] ${message}`);
		vscode.window.showErrorMessage(message);
		return;
	}

	const targetRoot = await resolveTargetDirectory(path.join(workspaceRoot, TARGET_DIRECTORY));
	await fs.mkdir(targetRoot, { recursive: true });
	await fs.cp(sourceSamples, path.join(targetRoot, SAMPLES_SOURCE_DIRECTORY), { recursive: true });

	input.outputChannel.appendLine(`[Model comparison] Exported official samples to ${targetRoot}`);
	vscode.window.showInformationMessage(`UDIA: model comparison samples exported to ${targetRoot}`);
}

function resolveWorkspaceRoot(): string | undefined {
	return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

async function resolveTargetDirectory(basePath: string): Promise<string> {
	if (!(await exists(basePath))) {
		return basePath;
	}
	return `${basePath}-${toFileTimestamp(new Date().toISOString())}`;
}

async function exists(filePath: string): Promise<boolean> {
	try {
		await fs.access(filePath);
		return true;
	} catch {
		return false;
	}
}

function toFileTimestamp(value: string): string {
	return value.replace(/[-:]/g, '').replace(/\.\d{3}Z$/, '').replace('T', '-');
}
