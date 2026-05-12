import * as vscode from 'vscode';
import { fetchSonarIssuesForFile } from './sonarIssuesApi.service';
import { fetchSonarJavaRulesCatalog } from './sonarRulesApi.service';

export type SonarContextResult = {
	text: string;
	enabled: boolean;
};

export class SonarContextService {
	async build(input: {
		document: vscode.TextDocument;
		progress?: vscode.Progress<{ message?: string; increment?: number }>;
	}): Promise<SonarContextResult> {
		const config = vscode.workspace.getConfiguration('udia');
		const enabled = Boolean(config.get('sonar.enabled'));
		const baseUrl = String(config.get('sonar.url') ?? '');
		const token = String(config.get('sonar.token') ?? '');
		const projectKey = String(config.get('sonar.projectKey') ?? '');
		const includeRulesCatalog = Boolean(config.get('sonar.includeJavaRulesCatalog') ?? true);
		const fetchOpenIssues = Boolean(config.get('sonar.fetchOpenIssuesForFile'));
		const organization = String(config.get('sonar.organization') ?? '');
		const folder = vscode.workspace.getWorkspaceFolder(input.document.uri);

		if (!enabled) {
			return {
				enabled,
				text: '(Sonar integration disabled. Configure udia.sonar.enabled, url, and token to enrich the prompt.)',
			};
		}

		if (!baseUrl || !token) {
			return {
				enabled,
				text: '(Sonar is enabled but udia.sonar.url or udia.sonar.token is missing.)',
			};
		}

		const blocks: string[] = [];
		if (includeRulesCatalog) {
			input.progress?.report({ increment: 15, message: 'Sonar API: rules catalog' });
			blocks.push(await fetchSonarJavaRulesCatalog({ baseUrl, token, organization }));
		}

		if (fetchOpenIssues && projectKey && folder) {
			input.progress?.report({ increment: 15, message: 'Sonar API: file issues' });
			const relativePath = vscode.workspace.asRelativePath(input.document.uri, false);
			blocks.push(
				await fetchSonarIssuesForFile(
					{ baseUrl, token, organization, projectKey },
					relativePath,
				),
			);
		}

		if (blocks.length === 0) {
			return {
				enabled,
				text: '(Sonar is enabled: enable udia.sonar.includeJavaRulesCatalog or udia.sonar.fetchOpenIssuesForFile with projectKey.)',
			};
		}

		return {
			enabled,
			text: blocks.filter((block) => block.trim().length > 0).join('\n\n---\n\n'),
		};
	}
}
