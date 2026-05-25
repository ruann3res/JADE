import * as vscode from 'vscode';
import type { AiStructuredFix } from '../entities/aiSuggestion';
import { jadeLog, jadeLogError, jadeLogSection, jadeShowOutput } from '../outputChannel';
import {
	AiExecutionReportExporter,
	buildAiExecutionReportId,
	type AiExecutionReport,
} from '../services/ai/aiExecutionReport.service';
import { AiFixGenerationService } from '../services/ai/aiFixGeneration.service';
import { OllamaConfigService } from '../services/config/ollamaConfig.service';
import { AiExecutionPanelService } from '../services/webview/aiExecutionPanel.service';
import { buildWorkspaceEdit } from '../services/vscode/jadeFixWorkspaceEdit.service';
import { ProgressNotifierService } from '../services/vscode/progressNotifier.service';

export const JADE_GENERATE_FIX_COMMAND = 'JADE.generateFix';

export type GenerateFixCommandArgs = {
	uri: vscode.Uri;
	diagnostic: {
		message: string;
		line: number;
		detail?: string;
		code?: string;
	};
};

export async function generateFixCommand(
	args?: GenerateFixCommandArgs,
	context?: vscode.ExtensionContext,
): Promise<void> {
	if (!args?.uri || !args.diagnostic) {
		vscode.window.showWarningMessage('JADE: no diagnostic was selected for AI fix generation.');
		return;
	}

	const document = await vscode.workspace.openTextDocument(args.uri);
	const ollamaConfig = new OllamaConfigService().read();
	const progress = new ProgressNotifierService();
	const service = new AiFixGenerationService();
	const panelService = new AiExecutionPanelService();
	const startedAt = new Date().toISOString();
	const startedMs = Date.now();

	await progress.run('JADE: Generating AI fix', async () => {
		jadeLogSection('AI Fix Generation');
		jadeLog(`File: ${document.fileName}`);
		jadeLog(`Diagnostic line: ${args.diagnostic.line}`);
		jadeLog(`Diagnostic code: ${args.diagnostic.code ?? '(none)'}`);
		jadeLog(`Diagnostic message: ${args.diagnostic.message}`);
		if (args.diagnostic.detail) {
			jadeLog(`Diagnostic detail: ${args.diagnostic.detail}`);
		}
		jadeLog(`Ollama model: ${ollamaConfig.modelId}`);
		jadeShowOutput(true);

		let result;
		try {
			result = await service.generateFix({
				document,
				diagnostic: args.diagnostic,
				ollamaConfig,
			});
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			jadeLogError(`AI fix generation failed: ${message}`);
			await showFixExecutionReport({
				context,
				panelService,
				document,
				diagnostic: args.diagnostic,
				modelId: ollamaConfig.modelId,
				startedAt,
				startedMs,
				status: 'error',
				validation: 'error',
				summary: `AI fix generation failed: ${message}`,
				errors: [message],
				rawResponse: '',
				modelContent: '',
			});
			vscode.window.showErrorMessage(`JADE: AI fix generation failed: ${message}`);
			return;
		}

		jadeLogSection('AI Fix Response');
		jadeLog('Model content:');
		appendMultiline(result.modelContent);
		jadeLog('Raw Ollama response:');
		appendMultiline(result.rawResponse);

		let fix = result.fix;
		jadeLogSection('AI Fix Parsed Result');
		jadeLog(fix ? JSON.stringify(fix, null, 2) : 'No structured fix parsed.');

		let edit = fix ? buildWorkspaceEdit(document, fix) : undefined;
		if (!edit) {
			const fallbackFix = buildSwallowedExceptionFallbackFix(document, args.diagnostic);
			const fallbackEdit = fallbackFix ? buildWorkspaceEdit(document, fallbackFix) : undefined;
			if (fallbackEdit) {
				jadeLog('Model fix was missing or unsafe; using swallowed-exception fallback fix.', 'warn');
				fix = fallbackFix;
				edit = fallbackEdit;
			}
		}

		if (!fix) {
			jadeLog('Result: rejected before edit because no safe structured fix was parsed.', 'warn');
			await showFixExecutionReport({
				context,
				panelService,
				document,
				diagnostic: args.diagnostic,
				modelId: ollamaConfig.modelId,
				startedAt,
				startedMs,
				status: 'warning',
				validation: 'notParsed',
				summary: 'The model returned no safe structured fix.',
				errors: [],
				rawResponse: result.rawResponse,
				modelContent: result.modelContent,
			});
			vscode.window.showWarningMessage('JADE: the model did not return a safe structured fix.');
			return;
		}

		if (!edit) {
			jadeLog('Result: rejected by WorkspaceEdit safety validation.', 'warn');
			await showFixExecutionReport({
				context,
				panelService,
				document,
				diagnostic: args.diagnostic,
				modelId: ollamaConfig.modelId,
				startedAt,
				startedMs,
				status: 'warning',
				validation: 'rejectedBySafety',
				summary: 'The model returned a structured fix, but JADE safety validation rejected it.',
				errors: [],
				rawResponse: result.rawResponse,
				modelContent: result.modelContent,
				parsedFix: fix,
			});
			vscode.window.showWarningMessage('JADE: generated fix was rejected by safety validation.');
			return;
		}

		jadeLogSection('AI Fix WorkspaceEdit');
		for (const [uri, textEdits] of edit.entries()) {
			jadeLog(`URI: ${uri.fsPath}`);
			for (const textEdit of textEdits) {
				jadeLog(
					`Range: ${textEdit.range.start.line + 1}:${textEdit.range.start.character + 1}-${textEdit.range.end.line + 1}:${textEdit.range.end.character + 1}`,
				);
				jadeLog('Replacement text:');
				appendMultiline(textEdit.newText);
			}
		}

		const applied = await vscode.workspace.applyEdit(edit);
		if (!applied) {
			jadeLogError('Result: VS Code could not apply the generated fix.');
			await showFixExecutionReport({
				context,
				panelService,
				document,
				diagnostic: args.diagnostic,
				modelId: ollamaConfig.modelId,
				startedAt,
				startedMs,
				status: 'error',
				validation: 'applyFailed',
				summary: 'VS Code could not apply the generated fix.',
				errors: ['VS Code could not apply the generated fix.'],
				rawResponse: result.rawResponse,
				modelContent: result.modelContent,
				parsedFix: fix,
			});
			vscode.window.showErrorMessage('JADE: VS Code could not apply the generated fix.');
			return;
		}

		jadeLog('Result: generated fix applied to the editor.');
		await showFixExecutionReport({
			context,
			panelService,
			document,
			diagnostic: args.diagnostic,
			modelId: ollamaConfig.modelId,
			startedAt,
			startedMs,
			status: 'success',
			validation: 'applied',
			summary: 'Generated fix applied to the editor.',
			errors: [],
			rawResponse: result.rawResponse,
			modelContent: result.modelContent,
			parsedFix: fix,
		});
		vscode.window.showInformationMessage('JADE: generated fix applied.');
	});
}

function appendMultiline(value: string): void {
	for (const line of value.split(/\r?\n/)) {
		jadeLog(`  ${line}`);
	}
}

export function buildSwallowedExceptionFallbackFix(
	document: vscode.TextDocument,
	diagnostic: GenerateFixCommandArgs['diagnostic'],
): AiStructuredFix | undefined {
	const diagnosticText = `${diagnostic.message} ${diagnostic.detail ?? ''}`.toLowerCase();
	if (
		!diagnosticText.includes('swallowed') &&
		!diagnosticText.includes('caught but not handled') &&
		!diagnosticText.includes('caught but not') &&
		!diagnosticText.includes('ignored')
	) {
		return undefined;
	}

	const anchorLine = Math.max(0, diagnostic.line - 1);
	const firstLine = Math.max(0, anchorLine - 2);
	const lastLine = Math.min(document.lineCount - 1, anchorLine + 2);
	for (let lineIndex = firstLine; lineIndex <= lastLine; lineIndex++) {
		const catchLine = document.lineAt(lineIndex).text;
		const match = catchLine.match(/^(\s*)}\s*catch\s*\(([^)]*)\)\s*\{\s*$/);
		if (!match) {
			continue;
		}

		const closingLineIndex = findEmptyCatchClosingLine(document, lineIndex + 1);
		if (closingLineIndex === undefined) {
			continue;
		}

		const exceptionName = extractExceptionVariableName(match[2]);
		if (!exceptionName) {
			return undefined;
		}

		const indent = match[1];
		const closingLine = document.lineAt(closingLineIndex).text;
		return {
			kind: 'replaceRange',
			startLine: lineIndex + 1,
			startColumn: 1,
			endLine: closingLineIndex + 1,
			endColumn: closingLine.length + 1,
			newText: `${catchLine}\n${indent}    throw new IllegalStateException("Failed to execute operation", ${exceptionName});\n${closingLine}`,
		};
	}

	return undefined;
}

function findEmptyCatchClosingLine(document: vscode.TextDocument, startLineIndex: number): number | undefined {
	for (let lineIndex = startLineIndex; lineIndex < document.lineCount; lineIndex++) {
		const text = document.lineAt(lineIndex).text.trim();
		if (text.length === 0 || text.startsWith('//') || text.startsWith('/*') || text.startsWith('*')) {
			continue;
		}
		return text === '}' ? lineIndex : undefined;
	}
	return undefined;
}

function extractExceptionVariableName(catchParameter: string): string | undefined {
	const match = catchParameter.trim().match(/([A-Za-z_$][\w$]*)\s*$/);
	return match?.[1];
}

type FixValidation = NonNullable<AiExecutionReport['fix']>['validation'];

async function showFixExecutionReport(input: {
	context?: vscode.ExtensionContext;
	panelService: AiExecutionPanelService;
	document: vscode.TextDocument;
	diagnostic: GenerateFixCommandArgs['diagnostic'];
	modelId: string;
	startedAt: string;
	startedMs: number;
	status: AiExecutionReport['status'];
	validation: FixValidation;
	summary: string;
	errors: string[];
	rawResponse: string;
	modelContent: string;
	parsedFix?: AiStructuredFix;
}): Promise<void> {
	const finishedAt = new Date().toISOString();
	const report: AiExecutionReport = {
		reportId: buildAiExecutionReportId('fix', input.startedAt),
		kind: 'fix',
		status: input.status,
		startedAt: input.startedAt,
		finishedAt,
		durationMs: Math.max(0, Date.now() - input.startedMs),
		modelId: input.modelId,
		fileName: input.document.fileName.split(/[/\\]/).pop() ?? input.document.fileName,
		filePath: input.document.uri.fsPath,
		summary: input.summary,
		errors: input.errors,
		rawResponse: input.rawResponse,
		fix: {
			diagnostic: input.diagnostic,
			parsedFix: input.parsedFix,
			validation: input.validation,
			modelContent: input.modelContent,
		},
	};
	const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
	if (workspaceRoot) {
		const artifacts = await new AiExecutionReportExporter(workspaceRoot).export(report);
		for (const artifact of artifacts) {
			jadeLog(`[AI report] ${artifact.format.toUpperCase()}: ${artifact.path}`);
		}
	}
	if (input.context) {
		const panel = input.panelService.create(input.context);
		input.panelService.fill(panel, report);
	}
}
