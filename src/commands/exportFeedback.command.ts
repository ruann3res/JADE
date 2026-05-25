import * as vscode from 'vscode';

const FEEDBACK_FORM_URL = 'https://forms.gle/nK6j4DD5Zd9tgcDv8';

export async function exportFeedbackCommand(): Promise<void> {
	const opened = await vscode.env.openExternal(vscode.Uri.parse(FEEDBACK_FORM_URL));
	if (!opened) {
		vscode.window.showErrorMessage(`Could not open JADE feedback form: ${FEEDBACK_FORM_URL}`);
	}
}

