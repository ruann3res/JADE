import * as vscode from 'vscode';

export class ProgressNotifierService {
	run<T>(
		title: string,
		task: (progress: vscode.Progress<{ message?: string; increment?: number }>) => Thenable<T>,
	): Thenable<T> {
		return vscode.window.withProgress(
			{
				location: vscode.ProgressLocation.Notification,
				title,
				cancellable: false,
			},
			task,
		);
	}
}
