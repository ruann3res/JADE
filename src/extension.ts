import * as vscode from 'vscode';
import { analyzeFileCommand } from './commands/analyzeFile.command';
import { selectOllamaModelCommand } from './commands/selectOllamaModel.command';
import { registerUdiaOutput } from './outputChannel';

export function activate(context: vscode.ExtensionContext) {
	const outputChannel = registerUdiaOutput(context);
	const diagnostics = vscode.languages.createDiagnosticCollection('udia');
	context.subscriptions.push(diagnostics);

	console.log('Congratulations, your extension "UDIA" is now active!');

	const disposable = vscode.commands.registerCommand('UDIA.helloWorld', () => {
		vscode.window.showInformationMessage('Hello World from UDIA!');
	});


	const analyzeJavaFile = vscode.commands.registerCommand(
		'UDIA.analyzeFile',
		(resource?: vscode.Uri) =>
			analyzeFileCommand({
				context,
				diagnostics,
				outputChannel,
				resource,
			}),
	);

	const selectOllamaModel = vscode.commands.registerCommand('UDIA.selectOllamaModel', () =>
		selectOllamaModelCommand(),
	);

	context.subscriptions.push(disposable, analyzeJavaFile, selectOllamaModel);
}

export function deactivate() {}
