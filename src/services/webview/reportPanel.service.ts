import * as crypto from 'crypto';
import * as vscode from 'vscode';
import type { AiSuggestionParsed } from '../../entities/aiSuggestion';
import type { FeedbackCategory, FeedbackReason, FeedbackRecord, FeedbackVerdict } from '../../entities/feedback';
import { JAVA_ANALYSIS_PROMPT_LOG_LABEL } from '../ai/prompts/javaAnalysisPrompt';
import { appendFeedbackRecord, feedbackFileName } from './feedback.service';

export type FeedbackSavePayload = {
	reportId: string;
	suggestionId: string;
	category: FeedbackCategory;
	line: number | null;
	title: string;
	suggestionText: string;
	rating: number | null;
	verdict: FeedbackVerdict;
	reason: FeedbackReason | null;
	comment: string | null;
};

export class ReportPanelService {
	create(context: vscode.ExtensionContext): vscode.WebviewPanel {
		const panel = vscode.window.createWebviewPanel(
			'udiaReport',
			'UDIA — Report and feedback',
			vscode.ViewColumn.Beside,
			{ enableScripts: true, retainContextWhenHidden: true },
		);
		context.subscriptions.push(panel);
		return panel;
	}

	fill(
		panel: vscode.WebviewPanel,
		suggestions: AiSuggestionParsed[],
		meta: { model: string; fileName: string },
		onFeedback: (payload: FeedbackSavePayload) => Promise<void>,
	): void {
		const nonce = crypto.randomBytes(16).toString('base64');
		const reportId = crypto.randomUUID();
		panel.webview.options = { enableScripts: true };
		panel.webview.html = buildHtml(panel.webview.cspSource, nonce, suggestions, { ...meta, reportId });
		panel.webview.onDidReceiveMessage(async (message: unknown) => {
			if (!message || typeof message !== 'object') {
				return;
			}
			const parsed = message as { type?: string; payload?: FeedbackSavePayload };
			if (parsed.type === 'saveFeedback' && parsed.payload) {
				await onFeedback(parsed.payload);
			}
		});
	}

	fillWithDefaultFeedback(
		panel: vscode.WebviewPanel,
		input: {
			context: vscode.ExtensionContext;
			suggestions: AiSuggestionParsed[];
			model: string;
			fileName: string;
		},
	): void {
		this.fill(
			panel,
			input.suggestions,
			{ model: input.model, fileName: input.fileName },
			async (payload) => {
				const title = payload.title.slice(0, 200);
				const suggestion = payload.suggestionText.slice(0, 500);
				const record: FeedbackRecord = {
					feedbackId: crypto.randomUUID(),
					timestamp: new Date().toISOString(),
					reportId: payload.reportId,
					findingId: buildFindingId({
						model: input.model,
						file: input.fileName,
						line: payload.line,
						category: payload.category,
						title,
						suggestion,
					}),
					suggestionId: payload.suggestionId,
					model: input.model,
					promptVersion: JAVA_ANALYSIS_PROMPT_LOG_LABEL,
					pluginVersion: readExtensionVersion(input.context),
					category: payload.category,
					file: input.fileName,
					line: payload.line,
					title,
					suggestion,
					reviewed: true,
					rating: payload.rating,
					verdict: payload.verdict,
					reason: payload.reason,
					falsePositive: payload.verdict === 'false_positive',
					comment: payload.comment,
				};
				try {
					await appendFeedbackRecord(record);
					vscode.window.showInformationMessage(`Feedback saved to ${feedbackFileName()}`);
				} catch (error) {
					const message = error instanceof Error ? error.message : String(error);
					vscode.window.showErrorMessage(message);
				}
			},
		);
	}
}

function buildHtml(
	cspSource: string,
	nonce: string,
	suggestions: AiSuggestionParsed[],
	meta: { model: string; fileName: string; reportId: string },
): string {
	const data = JSON.stringify({ suggestions, meta }).replace(/<\//g, '<\\/');
	const escapedTitle = escapeHtml('UDIA — report and review');
	return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';" />
  <style>
    body { font-family: system-ui, sans-serif; margin: 16px; color: var(--vscode-foreground); background: var(--vscode-editor-background); }
    h1 { font-size: 1.1rem; margin: 0 0 8px; }
    .card { border: 1px solid var(--vscode-widget-border); border-radius: 6px; padding: 12px; margin-bottom: 12px; }
    .meta { opacity: 0.85; font-size: 0.85rem; margin-bottom: 8px; }
    .stars span { cursor: pointer; font-size: 1.2rem; margin-right: 2px; }
    textarea, select { width: 100%; box-sizing: border-box; margin-top: 4px; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border); }
    textarea { min-height: 56px; margin-top: 8px; }
    button { margin-top: 8px; margin-right: 8px; padding: 6px 12px; cursor: pointer; }
    label { display: block; margin-top: 8px; }
    .ok { color: var(--vscode-testing-iconPassed); }
  </style>
</head>
<body>
  <h1>${escapedTitle}</h1>
  <p class="meta">${escapeHtml(meta.fileName)} · model: ${escapeHtml(meta.model)}</p>
  <div id="root"></div>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const DATA = ${data};
    const root = document.getElementById('root');
    const state = {};
    function render() {
      root.innerHTML = '';
      if (DATA.suggestions.length === 0) {
        root.textContent = 'No structured suggestions to display.';
        return;
      }
      DATA.suggestions.forEach((s) => {
        const id = s.id;
        state[id] = state[id] || { rating: null, verdict: 'unclear', reason: '', comment: '' };
        const card = document.createElement('div');
        card.className = 'card';
        const line = s.line != null ? ('Line ' + s.line + ' · ') : '';
        card.innerHTML =
          '<div><strong>' + line + s.category + '</strong></div>' +
          '<div>' + escapeHtml(s.summary) + '</div>' +
          '<div class="meta">' + escapeHtml(s.detail) + '</div>' +
          '<div class="stars" data-id="' + id + '"></div>' +
          '<label>Verdict<select data-verdict="' + id + '">' +
          '<option value="unclear">Unclear</option>' +
          '<option value="valid">Valid issue</option>' +
          '<option value="false_positive">False positive</option>' +
          '<option value="partially_valid">Partially valid</option>' +
          '</select></label>' +
          '<label>Reason<select data-reason="' + id + '">' +
          '<option value="">Select a reason (optional)</option>' +
          '<option value="useful">Useful</option>' +
          '<option value="test_file">Test or example code</option>' +
          '<option value="missing_context">Missing context</option>' +
          '<option value="wrong_line">Wrong line</option>' +
          '<option value="not_security_issue">Not a real security issue</option>' +
          '<option value="already_handled">Already handled</option>' +
          '<option value="too_generic">Too generic</option>' +
          '<option value="wrong_fix">Bad fix suggestion</option>' +
          '<option value="other">Other</option>' +
          '</select></label>' +
          '<textarea data-comment="' + id + '" placeholder="Comment (optional)"></textarea>' +
          '<button data-save="' + id + '">Save feedback</button>' +
          '<span class="ok" data-done="' + id + '"></span>';
        root.appendChild(card);
        const stars = card.querySelector('.stars');
        for (let n = 1; n <= 5; n += 1) {
          const sp = document.createElement('span');
          sp.textContent = state[id].rating >= n ? String.fromCharCode(9733) : String.fromCharCode(9734);
          sp.addEventListener('click', () => {
            state[id].rating = n;
            render();
          });
          stars.appendChild(sp);
        }
        const verdict = card.querySelector('[data-verdict="' + id + '"]');
        verdict.value = state[id].verdict;
        verdict.addEventListener('change', () => {
          state[id].verdict = verdict.value;
        });
        const reason = card.querySelector('[data-reason="' + id + '"]');
        reason.value = state[id].reason;
        reason.addEventListener('change', () => {
          state[id].reason = reason.value;
        });
        const ta = card.querySelector('[data-comment="' + id + '"]');
        ta.value = state[id].comment;
        ta.addEventListener('input', () => {
          state[id].comment = ta.value;
        });
        card.querySelector('[data-save="' + id + '"]').addEventListener('click', () => {
          const text = (s.summary + ' ' + s.detail).trim();
          vscode.postMessage({
            type: 'saveFeedback',
            payload: {
              reportId: DATA.meta.reportId,
              suggestionId: id,
              category: s.category,
              line: s.line == null ? null : s.line,
              title: s.summary,
              suggestionText: text.slice(0, 500),
              rating: state[id].rating,
              verdict: state[id].verdict,
              reason: state[id].reason || null,
              comment: state[id].comment.trim() ? state[id].comment.trim() : null,
            },
          });
          const done = card.querySelector('[data-done="' + id + '"]');
          done.textContent = 'Saved.';
        });
      });
    }
    function escapeHtml(t) {
      return String(t)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    }
    render();
  </script>
</body>
</html>`;
}

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

function buildFindingId(input: {
	model: string;
	file: string;
	line: number | null;
	category: FeedbackCategory;
	title: string;
	suggestion: string;
}): string {
	return crypto
		.createHash('sha256')
		.update([input.model, input.file, String(input.line ?? ''), input.category, input.title, input.suggestion].join('\u001f'))
		.digest('hex')
		.slice(0, 24);
}

function readExtensionVersion(context: vscode.ExtensionContext): string {
	const packageJson = context.extension.packageJSON as { version?: unknown };
	return typeof packageJson.version === 'string' ? packageJson.version : 'unknown';
}
