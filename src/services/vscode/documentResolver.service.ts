import * as vscode from 'vscode';

export class DocumentResolverService {
	async resolve(resource?: vscode.Uri): Promise<vscode.TextDocument | undefined> {
		if (resource) {
			return vscode.workspace.openTextDocument(resource);
		}
		return vscode.window.activeTextEditor?.document;
	}
}
