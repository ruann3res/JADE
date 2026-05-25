import * as vscode from 'vscode';
import { jadeLog, jadeLogSection, jadeShowOutput } from '../outputChannel';
import {
	AiExecutionReportExporter,
	buildAiExecutionReportId,
	type AiExecutionReport,
} from '../services/ai/aiExecutionReport.service';
import { runAiAnalysisInBatches } from '../services/ai/aiBatchAnalysis.service';
import { AiDiagnosticMapperService } from '../services/ai/aiDiagnosticMapper.service';
import { AiSuggestionFilterService } from '../services/ai/aiSuggestionFilter.service';
import { OllamaConfigService } from '../services/config/ollamaConfig.service';
import { RagConfigService } from '../services/config/ragConfig.service';
import { AnalysisReportService } from '../services/output/analysisReport.service';
import { createRagContextService } from '../services/rag';
import { SetupStateService } from '../services/setup';
import { AiExecutionPanelService } from '../services/webview/aiExecutionPanel.service';
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
	private readonly aiExecutionPanel = new AiExecutionPanelService();
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

		jadeShowOutput(true);
		jadeLogSection('Analysis start');
		jadeLog(`Analyzing: ${document.uri.fsPath} (${document.languageId})`);
		const startedAt = new Date().toISOString();
		const startedMs = Date.now();

		await this.progressNotifier.run('JADE: Java analysis (RAG + Ollama)', async (progress) => {
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
				context: input.context,
				suggestions: filtered.kept,
				model: ollamaConfig.modelId,
				fileName: document.fileName.split(/[/\\]/).pop() ?? document.fileName,
			});

			const batchErrors = batchResult.batchStats
				.map((batch) => batch.error)
				.filter((error): error is string => typeof error === 'string' && error.length > 0);
			const finishedAt = new Date().toISOString();
			const executionReport: AiExecutionReport = {
				reportId: buildAiExecutionReportId('analyze', startedAt),
				kind: 'analyze',
				status: batchErrors.length > 0 ? 'warning' : 'success',
				startedAt,
				finishedAt,
				durationMs: Math.max(0, Date.now() - startedMs),
				modelId: ollamaConfig.modelId,
				fileName: document.fileName.split(/[/\\]/).pop() ?? document.fileName,
				filePath: document.uri.fsPath,
				summary: `Parsed ${batchResult.suggestions.length} suggestion(s), kept ${filtered.kept.length}, published ${aiDiagnostic.diagnostics.length} diagnostic(s).`,
				errors: batchErrors,
				rawResponse: batchResult.body,
				analysis: {
					totalSuggestions: batchResult.suggestions.length,
					keptSuggestions: filtered.kept.length,
					droppedInvalidLine: filtered.droppedInvalidLine,
					truncatedForUi: filtered.truncated,
					diagnosticCount: aiDiagnostic.diagnostics.length,
					structuredFixCount: aiDiagnostic.suggestions.filter((suggestion) => suggestion.fix).length,
					batchStats: batchResult.batchStats,
					promptDebug: batchResult.promptDebug,
					suggestions: filtered.kept,
				},
			};
			await exportAiExecutionReport(resolveWorkspaceRoot(), executionReport, input.outputChannel);
			const executionPanel = this.aiExecutionPanel.create(input.context);
			this.aiExecutionPanel.fill(executionPanel, executionReport);

			this.completionToast.show({ filtered, batchResult, aiDiagnostic });
			jadeLog('Analysis complete.');
		});
	}
}

async function exportAiExecutionReport(
	workspaceRoot: string | undefined,
	report: AiExecutionReport,
	outputChannel: vscode.OutputChannel,
): Promise<void> {
	if (!workspaceRoot) {
		return;
	}
	const artifacts = await new AiExecutionReportExporter(workspaceRoot).export(report);
	for (const artifact of artifacts) {
		outputChannel.appendLine(`[AI report] ${artifact.format.toUpperCase()}: ${artifact.path}`);
	}
}

function resolveWorkspaceRoot(): string | undefined {
	return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}
