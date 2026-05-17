export type SonarCloudAuthInput = {
	readonly sonarUrl: string;
	readonly token: string;
	readonly organization?: string;
};

export type SonarCloudValidation = {
	readonly ok: boolean;
	readonly ruleCount: number;
	readonly httpStatus?: number;
	readonly error?: string;
	/** True when the server tells us the request needs an `organization` key. */
	readonly requiresOrganization?: boolean;
};

export type SonarCloudAuthDependencies = {
	fetchImpl?: typeof fetch;
};

/**
 * Light-weight check against `api/rules/search` that confirms whether a SonarCloud token
 * can list Java rules. Used by the setup wizard to validate the user input before ingestion.
 */
export class SonarCloudAuthService {
	private readonly fetchImpl: typeof fetch;

	constructor(deps: SonarCloudAuthDependencies = {}) {
		this.fetchImpl = deps.fetchImpl ?? fetch;
	}

	async validate(input: SonarCloudAuthInput): Promise<SonarCloudValidation> {
		const base = trimSlash(input.sonarUrl);
		const url = new URL(`${base}/api/rules/search`);
		url.searchParams.set('languages', 'java');
		url.searchParams.set('ps', '1');
		if (input.organization && input.organization.length > 0) {
			url.searchParams.set('organization', input.organization);
		}

		try {
			const response = await this.fetchImpl(url.toString(), {
				method: 'GET',
				headers: {
					Authorization: `Basic ${basicAuthHeader(input.token)}`,
					Accept: 'application/json',
				},
			});
			const raw = await response.text();
			if (!response.ok) {
				return {
					ok: false,
					ruleCount: 0,
					httpStatus: response.status,
					error: `HTTP ${response.status}: ${raw.slice(0, 200)}`,
					requiresOrganization: detectOrganizationProblem(response.status, raw, input.organization),
				};
			}
			const parsed = JSON.parse(raw) as { total?: number };
			const total = typeof parsed.total === 'number' ? parsed.total : 0;
			return { ok: total > 0, ruleCount: total };
		} catch (error) {
			return {
				ok: false,
				ruleCount: 0,
				error: error instanceof Error ? error.message : String(error),
			};
		}
	}
}

function basicAuthHeader(token: string): string {
	return Buffer.from(`${token}:`, 'utf-8').toString('base64');
}

function trimSlash(value: string): string {
	return value.replace(/\/$/, '');
}

function detectOrganizationProblem(
	status: number,
	body: string,
	currentOrganization: string | undefined,
): boolean {
	if (status === 400 && /organization/i.test(body) && /missing|required/i.test(body)) {
		return true;
	}
	if (status === 404 && /organization/i.test(body) && currentOrganization) {
		return true;
	}
	return false;
}
