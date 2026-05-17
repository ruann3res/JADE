import * as vscode from 'vscode';
import { udiaLog, udiaLogSection, udiaShowOutput } from '../outputChannel';
import { runAiAnalysisInBatches } from '../services/ai/aiBatchAnalysis.service';
import { AiDiagnosticMapperService } from '../services/ai/aiDiagnosticMapper.service';
import { AiSuggestionFilterService } from '../services/ai/aiSuggestionFilter.service';
import { OllamaConfigService } from '../services/config/ollamaConfig.service';
import { RagConfigService } from '../services/config/ragConfig.service';
import { AnalysisReportService } from '../services/output/analysisReport.service';
import { createRagContextService } from '../services/rag';
import { SetupStateService } from '../services/setup';
import { ReportPanelService } from '../services/webview/reportPanel.service';
import { BatchFailureNotifierService } from '../services/vscode/batchFailureNotifier.service';
import { CompletionToastService } from '../services/vscode/completionToast.service';
import { DiagnosticsPublisherService } from '../services/vscode/diagnosticsPublisher.service';
import { DocumentResolverService } from '../services/vscode/documentResolver.service';
import { LanguageGuardService } from '../services/vscode/languageGuard.service';
import { ProgressNotifierService } from '../services/vscode/progressNotifier.service';

export type AnalyzeFileHandlerInput = {
	context: vscode.ExtensionContext;
	diagnostics: vscode.DiagnosticCollection;
	outputChannel: vscode.OutputChannel;
	resource?: vscode.Uri;
};

export class AnalyzeFileHandler {
	private readonly documentResolver = new DocumentResolverService();
	private readonly languageGuard = new LanguageGuardService();
	private readonly progressNotifier = new ProgressNotifierService();
	private readonly ollamaConfig = new OllamaConfigService();
	private readonly ragConfig = new RagConfigService();
	private readonly batchFailureNotifier = new BatchFailureNotifierService();
	private readonly aiSuggestionFilter = new AiSuggestionFilterService();
	private readonly aiDiagnosticMapper = new AiDiagnosticMapperService();
	private readonly diagnosticsPublisher = new DiagnosticsPublisherService();
	private readonly analysisReport = new AnalysisReportService();
	private readonly reportPanel = new ReportPanelService();
	private readonly completionToast = new CompletionToastService();

	async execute(input: AnalyzeFileHandlerInput): Promise<void> {
		const document = await this.documentResolver.resolve(input.resource);
		if (!document) {
			vscode.window.showWarningMessage('Open a Java file to run analysis.');
			return;
		}

		if (!this.languageGuard.isJava(document)) {
			input.diagnostics.delete(document.uri);
			vscode.window.showWarningMessage(this.languageGuard.supportedLanguagesMessage());
			return;
		}

		udiaShowOutput(true);
		udiaLogSection('Analysis start');
		udiaLog(`Analyzing: ${document.uri.fsPath} (${document.languageId})`);

		await this.progressNotifier.run('UDIA: Java analysis (RAG + Ollama)', async (progress) => {
			progress.report({ increment: 0, message: 'Ollama configuration' });
			const ollamaConfig = this.ollamaConfig.read();
			const ragRuntimeConfig = this.ragConfig.read();
			const setupState = new SetupStateService(input.context);
			const ragContextService = createRagContextService({
				ragConfig: ragRuntimeConfig,
				ollamaConfig,
				setupState,
			});

			progress.report({ increment: 40, message: 'Ollama' });
			const batchResult = await runAiAnalysisInBatches({
				baseUrl: ollamaConfig.baseUrl,
				modelId: ollamaConfig.modelId,
				fileName: document.fileName.split(/[/\\]/).pop() ?? document.fileName,
				javaSource: document.getText(),
				ragContextService,
				onBatchStart: ({ batchNumber, totalBatches, alertCount }) => {
					progress.report({
						message: `Ollama batch ${batchNumber}/${totalBatches} (${alertCount} alert(s) in batch)`,
					});
				},
				ollamaRequestOptions: { timeoutMs: ollamaConfig.timeoutMs },
				batching: {
					maxLines: ollamaConfig.batchMaxLines,
					overlapLines: ollamaConfig.batchOverlapLines,
				},
			});

			this.batchFailureNotifier.warnIfAny(batchResult.batchStats);

			progress.report({ increment: 20, message: 'Publishing diagnostics' });
			const filtered = this.aiSuggestionFilter.refine(batchResult.suggestions, document.lineCount);
			const aiDiagnostic = this.aiDiagnosticMapper.map(document, filtered.kept);
			this.diagnosticsPublisher.set(input.diagnostics, document.uri, aiDiagnostic.diagnostics);

			this.analysisReport.render({
				document,
				batchResult,
				filtered,
				aiDiagnostic,
				ollamaConfig,
				outputChannel: input.outputChannel,
			});

			const panel = this.reportPanel.create(input.context);
			this.reportPanel.fillWithDefaultFeedback(panel, {
				suggestions: filtered.kept,
				model: ollamaConfig.modelId,
				fileName: document.fileName.split(/[/\\]/).pop() ?? document.fileName,
			});

			this.completionToast.show({ filtered, batchResult, aiDiagnostic });
			udiaLog('Analysis complete.');
		});
	}
}
