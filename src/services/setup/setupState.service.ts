import type * as vscode from 'vscode';

const SECRET_SONAR_TOKEN = 'jade.sonar.token';
const SECRET_SONAR_ORGANIZATION = 'jade.sonar.organization';
const STATE_SETUP_COMPLETE = 'jade.rag.setupComplete';
const STATE_METADATA = 'jade.rag.setupMetadata';

export type RagSetupMetadata = {
	ruleCount: number;
	completedAt: string;
	qdrantCollection: string;
	embeddingModel: string;
};

/**
 * Single source of truth for "is the optional Sonar RAG configured?".
 *
 * Tokens live in VS Code's encrypted SecretStorage (never in settings.json).
 * The completion flag lives in `globalState`, so analysis can cheaply check it.
 */
export class SetupStateService {
	constructor(private readonly context: vscode.ExtensionContext) {}

	isComplete(): boolean {
		return this.context.globalState.get<boolean>(STATE_SETUP_COMPLETE) === true;
	}

	getMetadata(): RagSetupMetadata | undefined {
		return this.context.globalState.get<RagSetupMetadata>(STATE_METADATA);
	}

	async markComplete(metadata: RagSetupMetadata): Promise<void> {
		await this.context.globalState.update(STATE_SETUP_COMPLETE, true);
		await this.context.globalState.update(STATE_METADATA, metadata);
	}

	async reset(): Promise<void> {
		await this.context.globalState.update(STATE_SETUP_COMPLETE, false);
		await this.context.globalState.update(STATE_METADATA, undefined);
		await this.context.secrets.delete(SECRET_SONAR_TOKEN);
		await this.context.secrets.delete(SECRET_SONAR_ORGANIZATION);
	}

	async getSonarToken(): Promise<string | undefined> {
		const value = await this.context.secrets.get(SECRET_SONAR_TOKEN);
		return value && value.length > 0 ? value : undefined;
	}

	async setSonarToken(token: string): Promise<void> {
		await this.context.secrets.store(SECRET_SONAR_TOKEN, token);
	}

	async getSonarOrganization(): Promise<string | undefined> {
		const value = await this.context.secrets.get(SECRET_SONAR_ORGANIZATION);
		return value && value.length > 0 ? value : undefined;
	}

	async setSonarOrganization(organization: string | undefined): Promise<void> {
		if (organization && organization.length > 0) {
			await this.context.secrets.store(SECRET_SONAR_ORGANIZATION, organization);
		} else {
			await this.context.secrets.delete(SECRET_SONAR_ORGANIZATION);
		}
	}
}
