import * as vscode from 'vscode';
import { JADE_GENERATE_FIX_COMMAND, type GenerateFixCommandArgs } from '../../commands/generateFix.command';
import { JADE_AI_DIAGNOSTIC_SOURCE } from '../ai/aiDiagnosticMapper.service';
import { buildWorkspaceEdit, readJadeAiFix } from './jadeFixWorkspaceEdit.service';

export class JadeCodeActionProvider implements vscode.CodeActionProvider {
	provideCodeActions(
		document: vscode.TextDocument,
		_range: vscode.Range,
		context: vscode.CodeActionContext,
		_token: vscode.CancellationToken,
	): vscode.CodeAction[] {
		if (context.only && !vscode.CodeActionKind.QuickFix.contains(context.only)) {
			return [];
		}

		return context.diagnostics.flatMap((diagnostic) => {
			if (!isJadeDiagnostic(diagnostic)) {
				return [];
			}

			const actions: vscode.CodeAction[] = [];
			const fix = readJadeAiFix(diagnostic);
			if (fix) {
				const edit = buildWorkspaceEdit(document, fix);
				if (edit) {
					const action = new vscode.CodeAction('JADE: Apply suggested fix', vscode.CodeActionKind.QuickFix);
					action.diagnostics = [diagnostic];
					action.edit = edit;
					action.isPreferred = true;
					actions.push(action);
				}
			}

			actions.push(createGenerateFixAction(document, diagnostic));
			return actions;
		});
	}
}

function isJadeDiagnostic(diagnostic: vscode.Diagnostic): boolean {
	return diagnostic.source === JADE_AI_DIAGNOSTIC_SOURCE;
}

function createGenerateFixAction(document: vscode.TextDocument, diagnostic: vscode.Diagnostic): vscode.CodeAction {
	const action = new vscode.CodeAction('JADE: Generate fix with AI', vscode.CodeActionKind.QuickFix);
	action.diagnostics = [diagnostic];
	action.command = {
		command: JADE_GENERATE_FIX_COMMAND,
		title: 'JADE: Generate fix with AI',
		arguments: [buildGenerateFixArgs(document, diagnostic)],
	};
	return action;
}

function buildGenerateFixArgs(document: vscode.TextDocument, diagnostic: vscode.Diagnostic): GenerateFixCommandArgs {
	return {
		uri: document.uri,
		diagnostic: {
			message: diagnostic.message,
			line: diagnostic.range.start.line + 1,
			detail: diagnostic.relatedInformation?.map((item) => item.message).join('\n'),
			code: diagnosticCodeToString(diagnostic.code),
		},
	};
}

function diagnosticCodeToString(code: vscode.Diagnostic['code']): string | undefined {
	if (code === undefined) {
		return undefined;
	}
	if (typeof code === 'object') {
		return String(code.value);
	}
	return String(code);
}
