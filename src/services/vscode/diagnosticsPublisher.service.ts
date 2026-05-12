import * as vscode from 'vscode';

export class DiagnosticsPublisherService {
	set(
		collection: vscode.DiagnosticCollection,
		uri: vscode.Uri,
		items: readonly vscode.Diagnostic[],
	): void {
		collection.set(uri, [...items]);
	}
}
