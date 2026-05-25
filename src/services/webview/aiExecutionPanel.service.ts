import * as crypto from 'crypto';
import * as vscode from 'vscode';
import type { AiExecutionReport } from '../ai/aiExecutionReport.service';

export class AiExecutionPanelService {
	create(context: vscode.ExtensionContext): vscode.WebviewPanel {
		const panel = vscode.window.createWebviewPanel(
			'jadeAiExecutionReport',
			'JADE - AI execution report',
			vscode.ViewColumn.Beside,
			{ enableScripts: true, retainContextWhenHidden: true },
		);
		context.subscriptions.push(panel);
		return panel;
	}

	fill(panel: vscode.WebviewPanel, report: AiExecutionReport): void {
		const nonce = crypto.randomBytes(16).toString('base64');
		panel.webview.options = { enableScripts: true };
		panel.webview.html = buildAiExecutionHtml(panel.webview.cspSource, nonce, report);
	}
}

export function buildAiExecutionHtml(cspSource: string, nonce: string, report: AiExecutionReport): string {
	const data = JSON.stringify(report).replace(/<\//g, '<\\/');
	return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';" />
  <style>
    body { font-family: system-ui, sans-serif; margin: 0; color: var(--vscode-foreground); background: var(--vscode-editor-background); }
    main { padding: 18px; max-width: 1120px; margin: 0 auto; }
    h1 { font-size: 1.2rem; margin: 0 0 4px; }
    h2 { font-size: 1rem; margin: 20px 0 8px; }
    h3 { font-size: 0.92rem; margin: 12px 0 6px; }
    .meta, .muted { color: var(--vscode-descriptionForeground); font-size: 0.85rem; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 10px; margin-top: 14px; }
    .card { border: 1px solid var(--vscode-widget-border); border-radius: 6px; padding: 12px; background: var(--vscode-editorWidget-background); }
    .metric { display: flex; justify-content: space-between; gap: 10px; margin: 6px 0; }
    .metric strong { font-variant-numeric: tabular-nums; }
    .badge { display: inline-block; border: 1px solid var(--vscode-widget-border); border-radius: 999px; padding: 2px 8px; font-size: 0.78rem; }
    .success { color: var(--vscode-testing-iconPassed); }
    .warning { color: var(--vscode-editorWarning-foreground); }
    .error { color: var(--vscode-testing-iconFailed); }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; }
    th, td { border-bottom: 1px solid var(--vscode-widget-border); padding: 7px 8px; text-align: left; vertical-align: top; }
    th { color: var(--vscode-descriptionForeground); font-weight: 600; }
    details { border: 1px solid var(--vscode-widget-border); border-radius: 6px; padding: 10px 12px; margin: 8px 0; }
    summary { cursor: pointer; font-weight: 600; }
    pre { white-space: pre-wrap; word-break: break-word; background: var(--vscode-textCodeBlock-background); padding: 10px; border-radius: 4px; max-height: 380px; overflow: auto; }
  </style>
</head>
<body>
  <main>
    <h1>JADE - AI execution report</h1>
    <div class="meta" id="meta"></div>
    <section class="grid" id="overview"></section>
    <section id="specific"></section>
    <section>
      <h2>Raw response</h2>
      <details><summary>Model output</summary><pre id="raw"></pre></details>
    </section>
  </main>
  <script nonce="${nonce}">
    const DATA = ${data};
    const fmt = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });
    const html = (value) => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const ms = (value) => value == null ? '-' : fmt.format(value) + ' ms';
    document.getElementById('meta').textContent = DATA.reportId + ' | ' + DATA.startedAt + ' to ' + DATA.finishedAt;
    document.getElementById('overview').innerHTML =
      card('Execution', metric('Command', DATA.kind) + metric('Status', '<span class="' + DATA.status + '">' + DATA.status + '</span>') + metric('Duration', ms(DATA.durationMs))) +
      card('Context', metric('Model', html(DATA.modelId)) + metric('File', html(DATA.fileName)) + metric('Errors', DATA.errors.length)) +
      card('Summary', '<div>' + html(DATA.summary) + '</div>');
    document.getElementById('specific').innerHTML = DATA.kind === 'analyze' ? renderAnalyze(DATA.analysis) : renderFix(DATA.fix);
    document.getElementById('raw').textContent = DATA.rawResponse || '';
    function card(title, body) { return '<article class="card"><h2>' + title + '</h2>' + body + '</article>'; }
    function metric(label, value) { return '<div class="metric"><span>' + label + '</span><strong>' + value + '</strong></div>'; }
    function renderAnalyze(analysis) {
      if (!analysis) { return ''; }
      return '<h2>Analysis traceability</h2><div class="grid">' +
        card('Suggestions', metric('Parsed', analysis.totalSuggestions) + metric('Kept', analysis.keptSuggestions) + metric('Invalid line', analysis.droppedInvalidLine) + metric('Structured fixes', analysis.structuredFixCount)) +
        card('Diagnostics', metric('Published', analysis.diagnosticCount) + metric('UI truncation', analysis.truncatedForUi) + metric('Batches', analysis.batchStats.length)) +
      '</div>' +
      '<h2>Batches and RAG</h2>' + batchTable(analysis.batchStats) +
      '<h2>Suggestions</h2>' + suggestionTable(analysis.suggestions) +
      '<details><summary>Prompt debug</summary><pre>' + html(JSON.stringify(analysis.promptDebug, null, 2)) + '</pre></details>';
    }
    function renderFix(fix) {
      if (!fix) { return ''; }
      return '<h2>Fix traceability</h2><div class="grid">' +
        card('Diagnostic', metric('Line', fix.diagnostic.line) + metric('Code', html(fix.diagnostic.code || '-')) + '<div class="muted">' + html(fix.diagnostic.message) + '</div>') +
        card('Validation', metric('Result', '<span class="badge">' + html(fix.validation) + '</span>') + metric('Parsed fix', fix.parsedFix ? fix.parsedFix.kind : '-')) +
      '</div>' +
      '<details open><summary>Parsed fix</summary><pre>' + html(JSON.stringify(fix.parsedFix || null, null, 2)) + '</pre></details>' +
      '<details><summary>Model content</summary><pre>' + html(fix.modelContent) + '</pre></details>';
    }
    function batchTable(batches) {
      if (!batches || batches.length === 0) { return '<p class="muted">No batch data recorded.</p>'; }
      return '<table><thead><tr><th>Batch</th><th>Lines</th><th>Parsed</th><th>User chars</th><th>RAG</th><th>Error</th></tr></thead><tbody>' +
        batches.map((batch) => '<tr><td>' + batch.batchNumber + '/' + batch.totalBatches + '</td><td>' + batch.lineStart + '-' + batch.lineEnd + '</td><td>' + batch.parsedCount + '</td><td>' + batch.userCharLength + '</td><td>' + html((batch.ragRetrievedIds || []).join(', ') || '-') + '</td><td>' + html(batch.error || '-') + '</td></tr>').join('') +
      '</tbody></table>';
    }
    function suggestionTable(suggestions) {
      if (!suggestions || suggestions.length === 0) { return '<p class="muted">No structured suggestions displayed.</p>'; }
      return '<table><thead><tr><th>Line</th><th>Category</th><th>Summary</th><th>Detail</th><th>Fix</th></tr></thead><tbody>' +
        suggestions.map((suggestion) => '<tr><td>' + html(suggestion.line ?? '-') + '</td><td>' + html(suggestion.category) + '</td><td>' + html(suggestion.summary) + '</td><td>' + html(suggestion.detail) + '</td><td>' + html(suggestion.fix ? suggestion.fix.kind : '-') + '</td></tr>').join('') +
      '</tbody></table>';
    }
  </script>
</body>
</html>`;
}
