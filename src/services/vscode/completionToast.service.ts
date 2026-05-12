import * as vscode from 'vscode';
import type { AiBatchAnalysisResult } from '../ai/aiBatchAnalysis.service';
import type { AiDiagnosticMappingResult } from '../ai/aiDiagnosticMapper.service';
import type { AiSuggestionFilterResult } from '../ai/aiSuggestionFilter.service';

export class CompletionToastService {
	show(input: {
		filtered: AiSuggestionFilterResult;
		batchResult: AiBatchAnalysisResult;
		aiDiagnostic: AiDiagnosticMappingResult;
	}): void {
		if (input.filtered.kept.length === 0) {
			const structured = input.batchResult.batchStats.some((batch) => batch.structuredJsonEnvelope === true);
			const emptyList = structured && input.batchResult.suggestions.length === 0;
			vscode.window.showInformationMessage(
				emptyList
					? 'Analysis complete: model returned an empty list (0 suggestions). See Output.'
					: 'Analysis complete: no AI suggestions in the panel. See Output.',
			);
			return;
		}

		const iaUi =
			input.batchResult.suggestions.length > 0
				? `AI: ${input.filtered.kept.length} with valid line numbers (parsed: ${input.batchResult.suggestions.length}${input.filtered.droppedInvalidLine > 0 ? `; ${input.filtered.droppedInvalidLine} outside the file` : ''})`
				: 'AI: no usable JSON';
		vscode.window.showInformationMessage(
			`Analysis complete: ${input.batchResult.batchStats.length} AI batch(es); panel has ${input.filtered.kept.length} suggestion(s); AI diagnostics: ${input.aiDiagnostic.diagnostics.length}. ${iaUi}.`,
		);
	}
}
