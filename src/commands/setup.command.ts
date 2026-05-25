import * as vscode from 'vscode';
import { jadeLog, jadeLogError, jadeLogSection, jadeShowOutput } from '../outputChannel';
import { OllamaConfigService } from '../services/config/ollamaConfig.service';
import { RagConfigService } from '../services/config/ragConfig.service';
import { OllamaEmbeddingClient } from '../services/rag/clients/ollamaEmbedding.client';
import { JadeQdrantClient } from '../services/rag/clients/qdrant.client';
import {
	DockerComposeService,
	OllamaModelService,
	SetupStateService,
	SetupWizardService,
	SonarCloudAuthService,
	SonarRulesIngestionService,
	type SonarCloudValidation,
} from '../services/setup';

const SONAR_DEFAULT_URL = 'https://sonarcloud.io';
const SONAR_TOKEN_PAGE = 'https://sonarcloud.io/account/security';
const SONAR_ORGS_PAGE = 'https://sonarcloud.io/account/organizations';

export async function runSetupCommand(input: {
	context: vscode.ExtensionContext;
}): Promise<void> {
	jadeShowOutput(true);
	jadeLogSection('JADE: Setup');

	const setupState = new SetupStateService(input.context);

	if (setupState.isComplete()) {
		const choice = await vscode.window.showInformationMessage(
			'JADE setup already completed. Do you want to re-run it (re-download rules)?',
			{ modal: true },
			'Re-run setup',
			'Reset setup',
			'Cancel',
		);
		if (choice === 'Reset setup') {
			await setupState.reset();
			vscode.window.showInformationMessage('JADE: setup reset. Analysis will use the embedded lexical RAG.');
			return;
		}
		if (choice !== 'Re-run setup') {
			return;
		}
	}

	const ollamaConfig = new OllamaConfigService().read();
	const ragConfig = new RagConfigService().read();

	const sonarUrl = (await promptForSonarUrl(SONAR_DEFAULT_URL)) ?? undefined;
	if (!sonarUrl) {
		return;
	}

	const openTokenPage = await vscode.window.showInformationMessage(
		'You will need a SonarCloud user token (scope: Execute Analysis). Open the token page now?',
		{ modal: true },
		'Open token page',
		'I have one',
		'Cancel',
	);
	if (openTokenPage === 'Cancel' || openTokenPage === undefined) {
		return;
	}
	if (openTokenPage === 'Open token page') {
		await vscode.env.openExternal(vscode.Uri.parse(SONAR_TOKEN_PAGE));
	}

	const tokenInput = await vscode.window.showInputBox({
		title: 'JADE: SonarCloud token',
		prompt: 'Paste your SonarCloud user token (stored securely in VS Code SecretStorage).',
		password: true,
		ignoreFocusOut: true,
		validateInput: (value) => (value && value.trim().length >= 16 ? undefined : 'Token looks too short.'),
	});
	if (!tokenInput) {
		return;
	}
	const token = tokenInput.trim();

	const sonarAuth = new SonarCloudAuthService();
	const credentials = await ensureValidSonarCredentials({ sonarUrl, token, sonarAuth });
	if (!credentials) {
		return;
	}
	const organization = credentials.organization;
	jadeLog(
		`[setup] Sonar credentials validated (org=${organization ?? 'public'}, visible rules=${credentials.ruleCount}).`,
	);

	const docker = new DockerComposeService(input.context.extensionUri.fsPath);
	const ollamaModel = new OllamaModelService();

	const embedder = new OllamaEmbeddingClient({
		baseUrl: ollamaConfig.baseUrl,
		model: ragConfig.embeddingModel,
		timeoutMs: 60_000,
	});
	const qdrant = new JadeQdrantClient({
		url: ragConfig.qdrantUrl,
		collection: ragConfig.qdrantCollection,
		vectorSize: 768,
	});
	const ingestion = new SonarRulesIngestionService({ embedder, qdrant });

	const wizard = new SetupWizardService({
		setupState,
		docker,
		ollamaModel,
		sonarAuth,
		ingestion,
		log: (message) => jadeLog(message),
	});

	try {
		await vscode.window.withProgress(
			{
				location: vscode.ProgressLocation.Notification,
				title: 'JADE: configuring RAG (Docker + Sonar + Qdrant)',
				cancellable: false,
			},
			async (progress) => {
				let lastPercent = 0;
				const outcome = await wizard.run(
					{
						ollamaBaseUrl: ollamaConfig.baseUrl,
						embeddingModel: ragConfig.embeddingModel,
						qdrantUrl: ragConfig.qdrantUrl,
						qdrantCollection: ragConfig.qdrantCollection,
						sonarUrl,
						sonarToken: token,
						sonarOrganization: organization,
					},
					(update) => {
						const increment =
							typeof update.percent === 'number' ? Math.max(0, update.percent - lastPercent) : 0;
						if (typeof update.percent === 'number') {
							lastPercent = update.percent;
						}
						progress.report({
							increment,
							message: `${update.step}${update.detail ? ` — ${update.detail}` : ''}`,
						});
					},
				);
				vscode.window.showInformationMessage(
					`JADE setup complete: ${outcome.ingestion.ruleCount} Sonar rules ingested into ${ragConfig.qdrantCollection}.`,
				);
			},
		);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		jadeLogError(`JADE setup failed: ${message}`);
		vscode.window.showErrorMessage(`JADE setup failed: ${message}`);
	}
}

export async function resetSetupCommand(input: {
	context: vscode.ExtensionContext;
}): Promise<void> {
	const setupState = new SetupStateService(input.context);
	const confirm = await vscode.window.showWarningMessage(
		'Reset JADE RAG setup? The extension will fall back to embedded lexical heuristics.',
		{ modal: true },
		'Reset',
	);
	if (confirm !== 'Reset') {
		return;
	}
	await setupState.reset();
	vscode.window.showInformationMessage('JADE RAG setup has been reset.');
}

async function promptForSonarUrl(defaultUrl: string): Promise<string | undefined> {
	return vscode.window.showInputBox({
		title: 'JADE: Sonar server URL',
		prompt: 'Use the default SonarCloud or point to a self-hosted SonarQube instance.',
		value: defaultUrl,
		ignoreFocusOut: true,
		validateInput: (value) =>
			value && /^https?:\/\//.test(value.trim()) ? undefined : 'Provide an http(s) URL.',
	});
}

type ResolvedSonarCredentials = {
	readonly organization: string | undefined;
	readonly ruleCount: number;
};

/**
 * Validates the SonarCloud token; if SonarCloud reports the request needs an
 * `organization` key (HTTP 400) or the supplied key is unknown (HTTP 404), prompts
 * the user to enter/replace the organization key and retries — without re-running
 * Docker/Qdrant from zero. Returns `undefined` when the user cancels.
 */
async function ensureValidSonarCredentials(args: {
	readonly sonarUrl: string;
	readonly token: string;
	readonly sonarAuth: SonarCloudAuthService;
}): Promise<ResolvedSonarCredentials | undefined> {
	let organization: string | undefined;
	let validation: SonarCloudValidation = await args.sonarAuth.validate({
		sonarUrl: args.sonarUrl,
		token: args.token,
		organization,
	});

	while (!validation.ok) {
		if (!validation.requiresOrganization) {
			vscode.window.showErrorMessage(
				`SonarCloud rejected the token (status ${validation.httpStatus ?? '-'}): ${validation.error ?? 'unknown error'}`,
			);
			return undefined;
		}

		const message = organization
			? `SonarCloud could not find organization "${organization}". Pick another organization key, or open the SonarCloud organizations page to copy the right one.`
			: 'SonarCloud requires an organization key for this token. Open the organizations page to copy yours, or enter it now.';
		const choice = await vscode.window.showWarningMessage(
			message,
			{ modal: true },
			'Open organizations page',
			'Enter organization key',
			'Cancel',
		);
		if (choice === undefined || choice === 'Cancel') {
			return undefined;
		}
		if (choice === 'Open organizations page') {
			await vscode.env.openExternal(vscode.Uri.parse(SONAR_ORGS_PAGE));
		}

		const orgInput = await vscode.window.showInputBox({
			title: 'JADE: SonarCloud organization key',
			prompt: 'Copy the "Key" column from https://sonarcloud.io/account/organizations.',
			value: organization,
			ignoreFocusOut: true,
			validateInput: (value) =>
				value && value.trim().length > 0 ? undefined : 'Organization key is required.',
		});
		if (!orgInput) {
			return undefined;
		}
		organization = orgInput.trim();

		validation = await args.sonarAuth.validate({
			sonarUrl: args.sonarUrl,
			token: args.token,
			organization,
		});
	}

	return { organization, ruleCount: validation.ruleCount };
}
