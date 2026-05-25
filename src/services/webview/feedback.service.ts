import * as fs from 'fs/promises';
import * as vscode from 'vscode';
import type { FeedbackRecord } from '../../entities/feedback';

const FILE_NAME = 'jade-feedback.json';

async function feedbackUri(): Promise<vscode.Uri | undefined> {
	const folder = vscode.workspace.workspaceFolders?.[0];
	if (!folder) {
		return undefined;
	}
	return vscode.Uri.joinPath(folder.uri, FILE_NAME);
}

export async function appendFeedbackRecord(record: FeedbackRecord): Promise<void> {
	const uri = await feedbackUri();
	if (!uri) {
		throw new Error('A workspace folder is required to save feedback.');
	}
	let existing: FeedbackRecord[] = [];
	try {
		const raw = await fs.readFile(uri.fsPath, 'utf-8');
		const parsed = JSON.parse(raw) as unknown;
		if (Array.isArray(parsed)) {
			existing = parsed as FeedbackRecord[];
		}
	} catch {
		void 0;
	}
	existing.push(record);
	await fs.writeFile(uri.fsPath, JSON.stringify(existing, null, 2), 'utf-8');
}

export function feedbackFileName(): string {
	return FILE_NAME;
}
