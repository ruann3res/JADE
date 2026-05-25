import * as crypto from 'crypto';
import * as vscode from 'vscode';
import type { ModelComparisonRunResult } from '../modelComparison/modelComparison.types';

export class ModelComparisonPanelService {
	create(context: vscode.ExtensionContext): vscode.WebviewPanel {
		const panel = vscode.window.createWebviewPanel(
			'jadeModelComparisonReport',
			'JADE - Model comparison analysis',
			vscode.ViewColumn.Beside,
			{ enableScripts: true, retainContextWhenHidden: true },
		);
		context.subscriptions.push(panel);
		return panel;
	}

	fill(panel: vscode.WebviewPanel, result: ModelComparisonRunResult): void {
		const nonce = crypto.randomBytes(16).toString('base64');
		panel.webview.options = { enableScripts: true };
		panel.webview.html = buildModelComparisonHtml(panel.webview.cspSource, nonce, result);
	}
}

export function buildModelComparisonHtml(
	cspSource: string,
	nonce: string,
	result: ModelComparisonRunResult,
): string {
	const data = JSON.stringify(result).replace(/<\//g, '<\\/');
	return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';" />
  <style>
    body { font-family: system-ui, sans-serif; margin: 0; color: var(--vscode-foreground); background: var(--vscode-editor-background); }
    main { padding: 18px; max-width: 1280px; margin: 0 auto; }
    h1 { font-size: 1.25rem; margin: 0 0 4px; }
    h2 { font-size: 1rem; margin: 22px 0 8px; }
    .meta, .muted { color: var(--vscode-descriptionForeground); font-size: 0.85rem; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 10px; margin-top: 14px; }
    .card { border: 1px solid var(--vscode-widget-border); border-radius: 6px; padding: 12px; background: var(--vscode-editorWidget-background); }
    .card h3 { margin: 0 0 10px; font-size: 0.95rem; }
    .metric { display: flex; justify-content: space-between; gap: 10px; margin: 6px 0; }
    .metric strong { font-variant-numeric: tabular-nums; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; }
    th, td { border-bottom: 1px solid var(--vscode-widget-border); padding: 7px 8px; text-align: left; vertical-align: top; }
    th { color: var(--vscode-descriptionForeground); font-weight: 600; }
    .badge { display: inline-block; border: 1px solid var(--vscode-widget-border); border-radius: 999px; padding: 2px 8px; font-size: 0.78rem; }
    .warn { color: var(--vscode-editorWarning-foreground); }
    .bar { height: 7px; border-radius: 999px; background: var(--vscode-input-background); overflow: hidden; margin-top: 5px; }
    .bar span { display: block; height: 100%; background: var(--vscode-progressBar-background); }
    details { border: 1px solid var(--vscode-widget-border); border-radius: 6px; padding: 10px 12px; margin: 8px 0; }
    summary { cursor: pointer; font-weight: 600; }
    pre { white-space: pre-wrap; word-break: break-word; background: var(--vscode-textCodeBlock-background); padding: 10px; border-radius: 4px; max-height: 360px; overflow: auto; }
    .split { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 8px; }
  </style>
</head>
<body>
  <main>
    <h1>JADE - Model comparison analysis</h1>
    <div class="meta" id="meta"></div>
    <div id="groundTruthNote"></div>
    <section>
      <h2>Model ranking</h2>
      <div class="grid" id="ranking"></div>
    </section>
    <section>
      <h2>Comparison by file</h2>
      <div id="summaryTable"></div>
    </section>
    <section>
      <h2>Execution details</h2>
      <div id="details"></div>
    </section>
  </main>
  <script nonce="${nonce}">
    const DATA = ${data};
    const fmt = new Intl.NumberFormat(undefined, { maximumFractionDigits: 4 });
    const ms = (value) => value == null ? '-' : fmt.format(value) + ' ms';
    const pct = (value) => value == null ? '-' : fmt.format(value * 100) + '%';
    const num = (value) => value == null ? '-' : fmt.format(value);
    const html = (value) => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const results = DATA.results || [];
    const summaries = DATA.summary || [];
    document.getElementById('meta').textContent = DATA.runId + ' | ' + DATA.startedAt + ' to ' + DATA.finishedAt + ' | prompt: ' + DATA.metadata.promptSource;
    const exploratory = summaries.some((row) => row.evaluationMode === 'none');
    if (exploratory) {
      document.getElementById('groundTruthNote').innerHTML = '<p class="warn">This run has no ground truth for at least one sample. Precision, recall and F1 are hidden for exploratory rows.</p>';
    }
    function aggregate() {
      const byModel = new Map();
      for (const row of summaries) {
        const current = byModel.get(row.modelId) || {
          modelId: row.modelId, modelLabel: row.modelLabel, cases: 0, responseTimeMs: 0,
          validSuggestionCount: 0, usefulSuggestionCount: 0, falsePositiveCount: 0,
          precisionSum: 0, precisionCount: 0, recallSum: 0, recallCount: 0, f1Sum: 0, f1Count: 0,
          averageFeedbackRating: 0
        };
        current.cases += 1;
        current.responseTimeMs += row.responseTimeMs;
        current.validSuggestionCount += row.validSuggestionCount;
        current.usefulSuggestionCount += row.usefulSuggestionCount;
        current.falsePositiveCount += row.falsePositiveCount;
        current.averageFeedbackRating += row.averageFeedbackRating;
        if (row.precision != null) { current.precisionSum += row.precision; current.precisionCount += 1; }
        if (row.recall != null) { current.recallSum += row.recall; current.recallCount += 1; }
        if (row.f1Score != null) { current.f1Sum += row.f1Score; current.f1Count += 1; }
        byModel.set(row.modelId, current);
      }
      return [...byModel.values()].map((item) => ({
        ...item,
        avgResponseTimeMs: item.cases ? item.responseTimeMs / item.cases : 0,
        avgFeedbackRating: item.cases ? item.averageFeedbackRating / item.cases : 0,
        avgPrecision: item.precisionCount ? item.precisionSum / item.precisionCount : null,
        avgRecall: item.recallCount ? item.recallSum / item.recallCount : null,
        avgF1: item.f1Count ? item.f1Sum / item.f1Count : null
      })).sort((a, b) => (b.avgF1 ?? -1) - (a.avgF1 ?? -1) || a.avgResponseTimeMs - b.avgResponseTimeMs);
    }
    const ranking = aggregate();
    document.getElementById('ranking').innerHTML = ranking.map((item, index) => '<article class="card">' +
      '<h3>#' + (index + 1) + ' ' + html(item.modelLabel) + '</h3>' +
      metric('Avg time', ms(item.avgResponseTimeMs)) +
      metric('Valid suggestions', num(item.validSuggestionCount)) +
      metric('Useful matches', num(item.usefulSuggestionCount)) +
      metric('False positives', num(item.falsePositiveCount)) +
      metric('Avg rating', num(item.avgFeedbackRating)) +
      metric('Precision', pct(item.avgPrecision)) +
      metric('Recall', pct(item.avgRecall)) +
      metric('F1', pct(item.avgF1)) +
      bar(item.avgF1) +
    '</article>').join('');
    document.getElementById('summaryTable').innerHTML = '<table><thead><tr>' +
      ['Model','File','Mode','Time','Valid','Useful','False +','Precision','Recall','F1'].map((h) => '<th>' + h + '</th>').join('') +
      '</tr></thead><tbody>' + summaries.map((row) => '<tr>' +
      '<td>' + html(row.modelLabel) + '</td><td>' + html(row.file) + '</td><td><span class="badge">' + html(row.evaluationMode) + '</span></td>' +
      '<td>' + ms(row.responseTimeMs) + '</td><td>' + num(row.validSuggestionCount) + '</td><td>' + num(row.usefulSuggestionCount) + '</td>' +
      '<td>' + num(row.falsePositiveCount) + '</td><td>' + pct(row.precision) + '</td><td>' + pct(row.recall) + '</td><td>' + pct(row.f1Score) + '</td>' +
      '</tr>').join('') + '</tbody></table>';
    document.getElementById('details').innerHTML = results.map((result) => '<details>' +
      '<summary>' + html(result.modelLabel) + ' on ' + html(result.file) + ' - ' + result.metrics.validSuggestionCount + ' valid suggestion(s)</summary>' +
      '<div class="split"><div>' + metric('Time', ms(result.metrics.responseTimeMs)) + metric('Errors', num(result.errors.length)) + metric('Invalid lines', num(result.metrics.invalidSuggestionCount)) + '</div>' +
      '<div>' + metric('Precision', pct(result.metrics.precision)) + metric('Recall', pct(result.metrics.recall)) + metric('F1', pct(result.metrics.f1Score)) + '</div></div>' +
      (result.errors.length ? '<p class="warn">' + html(result.errors.join('\\n')) + '</p>' : '') +
      '<h3>Findings</h3>' + findings(result.matches) +
      '<details><summary>Raw model response</summary><pre>' + html(result.rawResponse) + '</pre></details>' +
    '</details>').join('');
    function metric(label, value) { return '<div class="metric"><span>' + label + '</span><strong>' + value + '</strong></div>'; }
    function bar(value) { return '<div class="bar"><span style="width:' + Math.max(0, Math.min(100, (value ?? 0) * 100)) + '%"></span></div>'; }
    function findings(matches) {
      if (!matches || matches.length === 0) { return '<p class="muted">No structured findings returned.</p>'; }
      return '<table><thead><tr><th>Line</th><th>Category</th><th>Summary</th><th>Expected</th><th>Rating</th></tr></thead><tbody>' +
        matches.map((match) => '<tr><td>' + html(match.suggestion.line ?? '-') + '</td><td>' + html(match.suggestion.category) + '</td><td>' + html(match.suggestion.summary) + '<div class="muted">' + html(match.suggestion.detail) + '</div></td><td>' + html(match.expected ? match.expected.summary : (match.falsePositive ? 'False positive' : '-')) + '</td><td>' + html(match.rating) + '</td></tr>').join('') +
      '</tbody></table>';
    }
  </script>
</body>
</html>`;
}
