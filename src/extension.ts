import * as vscode from 'vscode';
import { analyzeFileCommand } from './commands/analyzeFile.command';
import { exportFeedbackCommand } from './commands/exportFeedback.command';
import { exportModelComparisonSamplesCommand } from './commands/exportModelComparisonSamples.command';
import { generateFixCommand, JADE_GENERATE_FIX_COMMAND } from './commands/generateFix.command';
import {
	openLatestAiReportCommand,
	openLatestModelComparisonReportCommand,
} from './commands/openLatestReports.command';
import { runModelComparisonCommand } from './commands/runModelComparison.command';
import { runOpenFileModelComparisonCommand } from './commands/runOpenFileModelComparison.command';
import { selectOllamaModelCommand } from './commands/selectOllamaModel.command';
import { resetSetupCommand, runSetupCommand } from './commands/setup.command';
import { registerJadeOutput } from './outputChannel';
import { JadeCodeActionProvider } from './services/vscode/jadeCodeActionProvider.service';

export function activate(context: vscode.ExtensionContext) {
	const outputChannel = registerJadeOutput(context);
	const diagnostics = vscode.languages.createDiagnosticCollection('jade');
	context.subscriptions.push(diagnostics);
	const codeActions = vscode.languages.registerCodeActionsProvider(
		{ language: 'java', scheme: 'file' },
		new JadeCodeActionProvider(),
		{ providedCodeActionKinds: [vscode.CodeActionKind.QuickFix] },
	);

	console.log('Congratulations, your extension "JADE" is now active!');

	const disposable = vscode.commands.registerCommand('JADE.helloWorld', () => {
		vscode.window.showInformationMessage('Hello World from JADE!');
	});


	const analyzeJavaFile = vscode.commands.registerCommand(
		'JADE.analyzeFile',
		(resource?: vscode.Uri) =>
			analyzeFileCommand({
				context,
				diagnostics,
				outputChannel,
				resource,
			}),
	);

	const selectOllamaModel = vscode.commands.registerCommand('JADE.selectOllamaModel', () =>
		selectOllamaModelCommand(),
	);

	const runModelComparison = vscode.commands.registerCommand('JADE.runModelComparison', () =>
		runModelComparisonCommand({ context, outputChannel }),
	);

	const runOpenFileModelComparison = vscode.commands.registerCommand(
		'JADE.runOpenFileModelComparison',
		(resource?: vscode.Uri) => runOpenFileModelComparisonCommand({ context, outputChannel, resource }),
	);

	const exportModelComparisonSamples = vscode.commands.registerCommand('JADE.exportModelComparisonSamples', () =>
		exportModelComparisonSamplesCommand({ context, outputChannel }),
	);

	const exportFeedback = vscode.commands.registerCommand('JADE.exportFeedback', () => exportFeedbackCommand());
	const generateFix = vscode.commands.registerCommand(JADE_GENERATE_FIX_COMMAND, (args) =>
		generateFixCommand(args, context),
	);
	const openLatestAiReport = vscode.commands.registerCommand('JADE.openLatestAiReport', () =>
		openLatestAiReportCommand({ context }),
	);
	const openLatestModelComparisonReport = vscode.commands.registerCommand(
		'JADE.openLatestModelComparisonReport',
		() => openLatestModelComparisonReportCommand({ context }),
	);

	const setupCommand = vscode.commands.registerCommand('JADE.setup', () => runSetupCommand({ context }));
	const resetSetup = vscode.commands.registerCommand('JADE.resetSetup', () => resetSetupCommand({ context }));

	context.subscriptions.push(
		disposable,
		analyzeJavaFile,
		selectOllamaModel,
		runModelComparison,
		runOpenFileModelComparison,
		exportModelComparisonSamples,
		exportFeedback,
		generateFix,
		openLatestAiReport,
		openLatestModelComparisonReport,
		setupCommand,
		resetSetup,
		codeActions,
	);
}

export function deactivate() {}
