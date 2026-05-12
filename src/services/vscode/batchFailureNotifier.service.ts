import * as vscode from 'vscode';
import type { AiBatchStats } from '../ai/aiBatchAnalysis.service';

export class BatchFailureNotifierService {
	warnIfAny(batchStats: readonly AiBatchStats[]): void {
		const failedBatches = batchStats.filter((batch) => batch.error);
		if (failedBatches.length > 0) {
			vscode.window.showWarningMessage(
				`Ollama: ${failedBatches.length} batch(es) failed; no additional diagnostics from those batch(es).`,
			);
		}
	}
}
