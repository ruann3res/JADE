import type { DockerComposeService } from './dockerCompose.service';
import type { OllamaModelService } from './ollamaModel.service';
import type { SonarCloudAuthService } from './sonarCloudAuth.service';
import type {
	IngestionProgress,
	SonarRulesIngestionResult,
	SonarRulesIngestionService,
} from './sonarRulesIngestion.service';
import type { SetupStateService } from './setupState.service';

export type SetupWizardLogger = (message: string) => void;

export type SetupWizardReporter = (update: { step: string; detail?: string; percent?: number }) => void;

export type SetupWizardInput = {
	readonly ollamaBaseUrl: string;
	readonly embeddingModel: string;
	readonly qdrantUrl: string;
	readonly qdrantCollection: string;
	readonly sonarUrl: string;
	readonly sonarToken: string;
	readonly sonarOrganization?: string;
};

export type SetupWizardOutcome = {
	readonly ingestion: SonarRulesIngestionResult;
	readonly composeFile: string;
	readonly composeSource: 'workspace' | 'extension';
};

export type SetupWizardDependencies = {
	setupState: SetupStateService;
	docker: DockerComposeService;
	ollamaModel: OllamaModelService;
	sonarAuth: SonarCloudAuthService;
	ingestion: SonarRulesIngestionService;
	log?: SetupWizardLogger;
};

/**
 * Linear orchestration of the six setup steps. UI concerns (progress notifications,
 * input boxes, secret prompts) live in the command layer; this service only describes
 * what to do and reports progress through the injected reporter/logger.
 */
export class SetupWizardService {
	private readonly deps: SetupWizardDependencies;

	constructor(deps: SetupWizardDependencies) {
		this.deps = deps;
	}

	async run(input: SetupWizardInput, report?: SetupWizardReporter): Promise<SetupWizardOutcome> {
		const log = this.deps.log ?? (() => undefined);

		report?.({ step: '1/6 Docker', percent: 0, detail: 'Checking Docker engine' });
		log('[setup] Checking Docker availability');
		await this.deps.docker.assertDockerAvailable();

		report?.({ step: '2/6 Compose', percent: 10, detail: 'Resolving docker-compose file' });
		const compose = await this.deps.docker.resolveCompose();
		log(`[setup] Using compose file (${compose.source}): ${compose.composeFile}`);
		report?.({
			step: '2/6 Compose',
			percent: 15,
			detail: `Starting Qdrant via ${compose.source} compose`,
		});
		await this.deps.docker.up(compose.composeFile);

		report?.({ step: '3/6 Qdrant', percent: 25, detail: `Waiting for ${input.qdrantUrl}` });
		log(`[setup] Waiting for Qdrant at ${input.qdrantUrl}`);
		await this.deps.docker.waitForQdrant(input.qdrantUrl);

		report?.({
			step: '4/6 Embeddings',
			percent: 35,
			detail: `Checking Ollama model ${input.embeddingModel}`,
		});
		log(`[setup] Checking embedding model ${input.embeddingModel}`);
		const installed = await this.deps.ollamaModel.isModelInstalled(
			input.ollamaBaseUrl,
			input.embeddingModel,
		);
		if (!installed) {
			report?.({
				step: '4/6 Embeddings',
				percent: 40,
				detail: `Pulling ${input.embeddingModel} (this may take a while)`,
			});
			log(`[setup] Pulling embedding model ${input.embeddingModel}`);
			await this.deps.ollamaModel.pull(input.ollamaBaseUrl, input.embeddingModel, (progress) => {
				const detail =
					progress.completed && progress.total
						? `${progress.status} ${formatBytes(progress.completed)}/${formatBytes(progress.total)}`
						: progress.status;
				report?.({ step: '4/6 Embeddings', detail });
			});
		}

		report?.({ step: '5/6 SonarCloud', percent: 55, detail: 'Validating Sonar token' });
		log('[setup] Validating Sonar token');
		const validation = await this.deps.sonarAuth.validate({
			sonarUrl: input.sonarUrl,
			token: input.sonarToken,
			organization: input.sonarOrganization,
		});
		if (!validation.ok) {
			throw new Error(
				`SonarCloud validation failed (status ${validation.httpStatus ?? '-'}): ${validation.error ?? 'no rules visible'}`,
			);
		}
		await this.deps.setupState.setSonarToken(input.sonarToken);
		await this.deps.setupState.setSonarOrganization(input.sonarOrganization);
		log(`[setup] Sonar token accepted (visible rules=${validation.ruleCount})`);

		report?.({
			step: '6/6 Ingestion',
			percent: 65,
			detail: `Ingesting Sonar rules into ${input.qdrantCollection}`,
		});
		const ingestion = await this.deps.ingestion.run(
			{
				sonarUrl: input.sonarUrl,
				sonarToken: input.sonarToken,
				sonarOrganization: input.sonarOrganization,
			},
			(progress) => {
				report?.({
					step: '6/6 Ingestion',
					percent: 65 + Math.min(30, percentForIngestion(progress)),
					detail: progress.message,
				});
			},
		);

		await this.deps.setupState.markComplete({
			ruleCount: ingestion.ruleCount,
			completedAt: new Date().toISOString(),
			qdrantCollection: input.qdrantCollection,
			embeddingModel: input.embeddingModel,
		});

		report?.({
			step: 'Done',
			percent: 100,
			detail: `Ingested ${ingestion.ruleCount} rules (failures=${ingestion.failures})`,
		});
		log(`[setup] Completed: ${ingestion.ruleCount} rules ingested, ${ingestion.failures} failures`);

		return { ingestion, composeFile: compose.composeFile, composeSource: compose.source };
	}
}

function percentForIngestion(progress: IngestionProgress): number {
	if (progress.total <= 0) {
		return 0;
	}
	return Math.floor((progress.current / progress.total) * 30);
}

function formatBytes(bytes: number): string {
	if (!Number.isFinite(bytes) || bytes <= 0) {
		return '0 B';
	}
	const units = ['B', 'KB', 'MB', 'GB'];
	let value = bytes;
	let unit = 0;
	while (value >= 1024 && unit < units.length - 1) {
		value /= 1024;
		unit += 1;
	}
	return `${value.toFixed(value >= 100 ? 0 : 1)} ${units[unit]}`;
}
