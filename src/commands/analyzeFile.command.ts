import * as vscode from 'vscode';
import { AnalyzeFileHandler } from '../handlers/analyzeFile.handler';

export type AnalyzeFileCommandInput = {
	context: vscode.ExtensionContext;
	diagnostics: vscode.DiagnosticCollection;
	outputChannel: vscode.OutputChannel;
	resource?: vscode.Uri;
};

export async function analyzeFileCommand(input: AnalyzeFileCommandInput): Promise<void> {
	const analyzeFileHandler = new AnalyzeFileHandler();
	await analyzeFileHandler.execute(input);
}
