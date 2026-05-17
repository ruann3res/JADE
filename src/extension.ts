import * as vscode from 'vscode';
import { analyzeFileCommand } from './commands/analyzeFile.command';
import { exportModelComparisonSamplesCommand } from './commands/exportModelComparisonSamples.command';
import { runModelComparisonCommand } from './commands/runModelComparison.command';
import { runOpenFileModelComparisonCommand } from './commands/runOpenFileModelComparison.command';
import { selectOllamaModelCommand } from './commands/selectOllamaModel.command';
import { resetSetupCommand, runSetupCommand } from './commands/setup.command';
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

	const runModelComparison = vscode.commands.registerCommand('UDIA.runModelComparison', () =>
		runModelComparisonCommand({ context, outputChannel }),
	);

	const runOpenFileModelComparison = vscode.commands.registerCommand(
		'UDIA.runOpenFileModelComparison',
		(resource?: vscode.Uri) => runOpenFileModelComparisonCommand({ context, outputChannel, resource }),
	);

	const exportModelComparisonSamples = vscode.commands.registerCommand('UDIA.exportModelComparisonSamples', () =>
		exportModelComparisonSamplesCommand({ context, outputChannel }),
	);

	const setupCommand = vscode.commands.registerCommand('UDIA.setup', () => runSetupCommand({ context }));
	const resetSetup = vscode.commands.registerCommand('UDIA.resetSetup', () => resetSetupCommand({ context }));

	context.subscriptions.push(
		disposable,
		analyzeJavaFile,
		selectOllamaModel,
		runModelComparison,
		runOpenFileModelComparison,
		exportModelComparisonSamples,
		setupCommand,
		resetSetup,
	);
}

export function deactivate() {}
