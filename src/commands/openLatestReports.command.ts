import * as fs from 'fs/promises';
import * as path from 'path';
import * as vscode from 'vscode';
import type { AiExecutionReport } from '../services/ai/aiExecutionReport.service';
import type { ModelComparisonRunResult } from '../services/modelComparison/modelComparison.types';
import { AiExecutionPanelService } from '../services/webview/aiExecutionPanel.service';
import { ModelComparisonPanelService } from '../services/webview/modelComparisonPanel.service';

export async function openLatestAiReportCommand(input: { context: vscode.ExtensionContext }): Promise<void> {
	const workspaceRoot = resolveWorkspaceRoot();
	if (!workspaceRoot) {
		vscode.window.showWarningMessage('Open a workspace folder before opening the latest JADE AI report.');
		return;
	}

	const reportPath = await newestExistingPath([
		path.join(workspaceRoot, 'jade-ai-reports', 'analyze', 'latest.json'),
		path.join(workspaceRoot, 'jade-ai-reports', 'fix', 'latest.json'),
	]);
	if (!reportPath) {
		vscode.window.showWarningMessage('JADE: no AI report found yet.');
		return;
	}

	const report = JSON.parse(await fs.readFile(reportPath, 'utf-8')) as AiExecutionReport;
	const panelService = new AiExecutionPanelService();
	const panel = panelService.create(input.context);
	panelService.fill(panel, report);
}

export async function openLatestModelComparisonReportCommand(input: {
	context: vscode.ExtensionContext;
}): Promise<void> {
	const workspaceRoot = resolveWorkspaceRoot();
	if (!workspaceRoot) {
		vscode.window.showWarningMessage('Open a workspace folder before opening the latest JADE model comparison report.');
		return;
	}

	const reportPath = await newestExistingPath([
		path.join(workspaceRoot, 'model-comparison-results', 'latest.json'),
		path.join(workspaceRoot, 'model-comparison-results', 'open-file', 'latest.json'),
	]);
	if (!reportPath) {
		vscode.window.showWarningMessage('JADE: no model comparison report found yet.');
		return;
	}

	const result = JSON.parse(await fs.readFile(reportPath, 'utf-8')) as ModelComparisonRunResult;
	const panelService = new ModelComparisonPanelService();
	const panel = panelService.create(input.context);
	panelService.fill(panel, result);
}

async function newestExistingPath(candidates: string[]): Promise<string | undefined> {
	const existing = await Promise.all(
		candidates.map(async (candidate) => {
			try {
				const stat = await fs.stat(candidate);
				return { candidate, mtimeMs: stat.mtimeMs };
			} catch {
				return undefined;
			}
		}),
	);
	return existing
		.filter((entry): entry is { candidate: string; mtimeMs: number } => entry !== undefined)
		.sort((a, b) => b.mtimeMs - a.mtimeMs)[0]?.candidate;
}

function resolveWorkspaceRoot(): string | undefined {
	return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}
