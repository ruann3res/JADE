import type { SonarApiConfig } from '../../entities/sonarConfig';

type SonarIssue = {
	readonly message?: string;
	readonly severity?: string;
	readonly type?: string;
	readonly rule?: string;
	readonly line?: number;
};

type SonarIssuesSearchResponse = {
	readonly total?: number;
	readonly issues?: readonly SonarIssue[];
};

function basicAuthHeader(token: string): string {
	return Buffer.from(`${token}:`, 'utf-8').toString('base64');
}

export async function fetchSonarIssuesForFile(
	config: SonarApiConfig,
	fileRelativePath: string,
): Promise<string> {
	const base = config.baseUrl.replace(/\/$/, '');
	const normalizedFile = fileRelativePath.replace(/\\/g, '/');
	const componentKeys = `${config.projectKey}:${normalizedFile}`;

	const url = new URL(`${base}/api/issues/search`);
	url.searchParams.set('componentKeys', componentKeys);
	url.searchParams.set('statuses', 'OPEN,CONFIRMED,REOPENED');
	url.searchParams.set('ps', '100');
	url.searchParams.set('p', '1');
	const organization = config.organization.trim();
	if (organization) {
		url.searchParams.set('organization', organization);
	}

	let response: Response;
	try {
		response = await fetch(url.toString(), {
			method: 'GET',
			headers: {
				Authorization: `Basic ${basicAuthHeader(config.token)}`,
				Accept: 'application/json',
			},
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		return `Sonar API (network): ${message}`;
	}

	const raw = await response.text();
	if (!response.ok) {
		return `Sonar API HTTP ${response.status}: ${raw.slice(0, 1200)}`;
	}

	let data: SonarIssuesSearchResponse;
	try {
		data = JSON.parse(raw) as SonarIssuesSearchResponse;
	} catch {
		return raw.slice(0, 4000);
	}

	const issues = Array.isArray(data.issues) ? data.issues : [];
	if (issues.length === 0) {
		const total = typeof data.total === 'number' ? data.total : 0;
		return `Sonar API: 0 open issues for "${componentKeys}" (API total: ${total}). Verify projectKey and file path in Sonar.`;
	}

	const lines: string[] = [
		`Sonar API: ${issues.length} issue(s) in componentKeys=${componentKeys}`,
		'',
	];
	for (const issue of issues) {
		const line = typeof issue.line === 'number' ? `L${issue.line}` : 'L?';
		lines.push(
			`[${issue.severity ?? '?'}|${issue.type ?? '?'}] ${line} ${issue.rule ?? ''}: ${issue.message ?? ''}`,
		);
	}
	return lines.join('\n');
}
