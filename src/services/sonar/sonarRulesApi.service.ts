import type { SonarRulesApiConfig } from '../../entities/sonarConfig';

type SonarRuleRow = {
	readonly key?: string;
	readonly name?: string;
	readonly severity?: string;
	readonly type?: string;
};

type SonarRulesSearchResponse = {
	readonly rules?: readonly SonarRuleRow[];
};

function basicAuthHeader(token: string): string {
	return Buffer.from(`${token}:`, 'utf-8').toString('base64');
}

export async function fetchSonarJavaRulesCatalog(
	config: SonarRulesApiConfig,
	options?: { maxChars?: number; pageSize?: number },
): Promise<string> {
	const base = config.baseUrl.replace(/\/$/, '');
	const maxChars = options?.maxChars ?? 14_000;
	const pageSize = Math.min(options?.pageSize ?? 200, 500);
	const organization = config.organization.trim();
	const isCloud = base.includes('sonarcloud.io');

	if (isCloud && !organization) {
		return 'Sonar rules API: on SonarCloud, udia.sonar.organization is required for api/rules/search.';
	}

	const lines: string[] = [
		'Java rules catalog (GET /api/rules/search?languages=java) — Sonar rule types for the agent.',
		'These are not project issues; they are the kinds of findings Sonar can report.',
		'',
	];

	let page = 1;
	let accumulated = lines.join('\n');

	while (accumulated.length < maxChars && page <= 8) {
		const url = new URL(`${base}/api/rules/search`);
		url.searchParams.set('languages', 'java');
		url.searchParams.set('ps', String(pageSize));
		url.searchParams.set('p', String(page));
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
			return `Sonar rules API (network): ${message}`;
		}

		const raw = await response.text();
		if (!response.ok) {
			return `Sonar rules API HTTP ${response.status}: ${raw.slice(0, 1200)}`;
		}

		let data: SonarRulesSearchResponse;
		try {
			data = JSON.parse(raw) as SonarRulesSearchResponse;
		} catch {
			return raw.slice(0, 4000);
		}

		const batch = Array.isArray(data.rules) ? data.rules : [];
		if (batch.length === 0) {
			if (page === 1) {
				return 'Sonar rules API: 0 Java rules returned (check organization and token).';
			}
			break;
		}

		for (const rule of batch) {
			const row = `- ${rule.key ?? ''} [${rule.type ?? '?'}|${rule.severity ?? '?'}] ${rule.name ?? ''}`;
			if (accumulated.length + row.length + 1 > maxChars) {
				lines.push('... (catalog truncated by plugin size limit)');
				return lines.join('\n');
			}
			lines.push(row);
			accumulated = lines.join('\n');
		}

		if (batch.length < pageSize) {
			break;
		}
		page += 1;
	}

	lines.push('');
	lines.push(`(Included ${lines.length - 3} rules in this catalog; the Sonar API may have more Java entries.)`);
	return lines.join('\n');
}
