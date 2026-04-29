import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {

	console.log('Congratulations, your extension "UDIA" is now active!');

	const disposable = vscode.commands.registerCommand('UDIA.helloWorld', () => {
		vscode.window.showInformationMessage('Hello World from UDIA!');
	});

	context.subscriptions.push(disposable);
}

export function deactivate() {}
