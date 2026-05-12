export type SonarApiConfig = {
	readonly baseUrl: string;
	readonly token: string;
	readonly organization: string;
	readonly projectKey: string;
};

export type SonarRulesApiConfig = {
	readonly baseUrl: string;
	readonly token: string;
	readonly organization: string;
};
