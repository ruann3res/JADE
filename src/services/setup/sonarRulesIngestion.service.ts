import type { FeedbackCategory } from '../../entities/feedback';
import type { EmbeddingClient } from '../rag/clients/ollamaEmbedding.client';
import type { QdrantRulePayload, JadeQdrantClient } from '../rag/clients/qdrant.client';

export type SonarRulesIngestionInput = {
	readonly sonarUrl: string;
	readonly sonarToken: string;
	readonly sonarOrganization?: string;
	readonly languages?: string;
	readonly pageSize?: number;
	readonly maxRules?: number;
	readonly requestDelayMs?: number;
};

export type IngestionProgress = {
	readonly phase: 'list' | 'fetch' | 'embed' | 'upsert' | 'done';
	readonly current: number;
	readonly total: number;
	readonly message: string;
};

export type SonarRulesIngestionResult = {
	readonly ruleCount: number;
	readonly failures: number;
	readonly vectorSize: number;
};

export type SonarRulesIngestionDependencies = {
	embedder: EmbeddingClient;
	qdrant: JadeQdrantClient;
	fetchImpl?: typeof fetch;
};

type SonarRule = {
	key: string;
	name?: string;
	severity?: string;
	type?: string;
	tags?: string[];
	cleanCodeAttribute?: string;
	htmlDesc?: string;
	mdDesc?: string;
	descriptionSections?: Array<{ key?: string; content?: string }>;
};

type SonarRulesSearchResponse = { rules?: SonarRule[]; total?: number };
type SonarRuleShowResponse = { rule?: SonarRule };

const DEFAULTS = {
	languages: 'java',
	pageSize: 200,
	maxRules: 600,
	requestDelayMs: 120,
};

/**
 * Downloads the public Sonar Java rules catalog, embeds each rule and upserts the vectors
 * into the provided Qdrant collection. Reused by the in-extension setup wizard.
 */
export class SonarRulesIngestionService {
	private readonly embedder: EmbeddingClient;
	private readonly qdrant: JadeQdrantClient;
	private readonly fetchImpl: typeof fetch;

	constructor(deps: SonarRulesIngestionDependencies) {
		this.embedder = deps.embedder;
		this.qdrant = deps.qdrant;
		this.fetchImpl = deps.fetchImpl ?? fetch;
	}

	async run(
		input: SonarRulesIngestionInput,
		onProgress?: (progress: IngestionProgress) => void,
	): Promise<SonarRulesIngestionResult> {
		const config = this.normalize(input);
		onProgress?.({ phase: 'list', current: 0, total: 0, message: 'Probing embedding model' });
		const probe = await this.embedder.embed('probe');
		const vectorSize = probe.length;

		await this.qdrant.ensureCollection();

		onProgress?.({ phase: 'list', current: 0, total: 0, message: 'Listing Sonar rule keys' });
		const ruleKeys = await this.fetchAllRuleKeys(config);
		const total = ruleKeys.length;
		onProgress?.({ phase: 'list', current: total, total, message: `Found ${total} rule keys` });

		let processed = 0;
		let failures = 0;
		for (const [index, key] of ruleKeys.entries()) {
			const current = index + 1;
			try {
				onProgress?.({
					phase: 'fetch',
					current,
					total,
					message: `Fetching description for ${key}`,
				});
				const rule = await this.fetchRuleDescription(key, config);
				if (!rule) {
					failures += 1;
					continue;
				}
				const text = buildEmbeddingText(rule);
				if (text.length === 0) {
					failures += 1;
					continue;
				}
				onProgress?.({ phase: 'embed', current, total, message: `Embedding ${key}` });
				const vector = await this.embedder.embed(text);
				onProgress?.({ phase: 'upsert', current, total, message: `Upserting ${key} (${current}/${total})` });
				await this.qdrant.upsert([
					{ id: keyToPointId(rule.key), vector, payload: toPayload(rule) },
				]);
				processed += 1;
			} catch {
				failures += 1;
			}
			if (config.requestDelayMs > 0 && current < total) {
				await delay(config.requestDelayMs);
			}
		}

		onProgress?.({
			phase: 'done',
			current: processed,
			total,
			message: `Ingestion complete: ${processed}/${total} rules (failures=${failures})`,
		});
		return { ruleCount: processed, failures, vectorSize };
	}

	private normalize(input: SonarRulesIngestionInput): Required<SonarRulesIngestionInput> {
		return {
			sonarUrl: trimSlash(input.sonarUrl),
			sonarToken: input.sonarToken,
			sonarOrganization: input.sonarOrganization ?? '',
			languages: input.languages ?? DEFAULTS.languages,
			pageSize: positive(input.pageSize, DEFAULTS.pageSize),
			maxRules: positive(input.maxRules, DEFAULTS.maxRules),
			requestDelayMs: nonNegative(input.requestDelayMs, DEFAULTS.requestDelayMs),
		};
	}

	private async fetchAllRuleKeys(config: Required<SonarRulesIngestionInput>): Promise<string[]> {
		const keys: string[] = [];
		let page = 1;
		while (keys.length < config.maxRules) {
			const url = new URL(`${config.sonarUrl}/api/rules/search`);
			url.searchParams.set('languages', config.languages);
			url.searchParams.set('ps', String(config.pageSize));
			url.searchParams.set('p', String(page));
			if (config.sonarOrganization) {
				url.searchParams.set('organization', config.sonarOrganization);
			}
			const data = await this.sonarFetch<SonarRulesSearchResponse>(url, config);
			const batch = Array.isArray(data.rules) ? data.rules : [];
			if (batch.length === 0) {
				break;
			}
			for (const rule of batch) {
				if (rule.key) {
					keys.push(rule.key);
					if (keys.length >= config.maxRules) {
						break;
					}
				}
			}
			if (batch.length < config.pageSize) {
				break;
			}
			page += 1;
		}
		return keys;
	}

	private async fetchRuleDescription(
		key: string,
		config: Required<SonarRulesIngestionInput>,
	): Promise<SonarRule | undefined> {
		const url = new URL(`${config.sonarUrl}/api/rules/show`);
		url.searchParams.set('key', key);
		url.searchParams.set(
			'f',
			'name,severity,type,tags,cleanCodeAttribute,mdDesc,htmlDesc,descriptionSections',
		);
		if (config.sonarOrganization) {
			url.searchParams.set('organization', config.sonarOrganization);
		}
		const data = await this.sonarFetch<SonarRuleShowResponse>(url, config);
		return data.rule;
	}

	private async sonarFetch<T>(url: URL, config: Required<SonarRulesIngestionInput>): Promise<T> {
		const auth = Buffer.from(`${config.sonarToken}:`, 'utf-8').toString('base64');
		const response = await this.fetchImpl(url.toString(), {
			method: 'GET',
			headers: {
				Authorization: `Basic ${auth}`,
				Accept: 'application/json',
			},
		});
		const raw = await response.text();
		if (!response.ok) {
			throw new Error(`Sonar HTTP ${response.status} on ${url.pathname}: ${raw.slice(0, 200)}`);
		}
		return JSON.parse(raw) as T;
	}
}

function buildEmbeddingText(rule: SonarRule): string {
	const sections = (rule.descriptionSections ?? [])
		.map((section) => stripHtml(section.content ?? ''))
		.filter((content) => content.length > 0);
	const description = stripHtml(rule.mdDesc ?? rule.htmlDesc ?? '');
	const tagLine = (rule.tags ?? []).join(', ');
	return [rule.name ?? '', description, ...sections, tagLine ? `Tags: ${tagLine}` : '']
		.filter((part) => part.trim().length > 0)
		.join('\n\n')
		.slice(0, 8_000);
}

function toPayload(rule: SonarRule): QdrantRulePayload {
	const guidance = buildEmbeddingText(rule).slice(0, 2_000);
	return {
		id: rule.key,
		title: rule.name ?? rule.key,
		category: mapCategory(rule.type, rule.tags ?? []),
		guidance,
		severity: rule.severity,
		sonarType: rule.type,
		tags: rule.tags,
		cleanCodeAttribute: rule.cleanCodeAttribute,
	};
}

function mapCategory(type: string | undefined, tags: readonly string[]): FeedbackCategory {
	const normalized = (type ?? '').toUpperCase();
	if (normalized === 'BUG') {
		return 'bug';
	}
	if (normalized === 'VULNERABILITY' || normalized === 'SECURITY_HOTSPOT') {
		return 'security';
	}
	if (tags.includes('duplicated-code') || tags.includes('duplication')) {
		return 'duplication';
	}
	return 'codeSmell';
}

function stripHtml(value: string): string {
	return value
		.replace(/<style[\s\S]*?<\/style>/gi, ' ')
		.replace(/<script[\s\S]*?<\/script>/gi, ' ')
		.replace(/<[^>]+>/g, ' ')
		.replace(/&nbsp;/g, ' ')
		.replace(/&amp;/g, '&')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/\s+/g, ' ')
		.trim();
}

function keyToPointId(key: string): number {
	let hash = 0;
	for (let index = 0; index < key.length; index += 1) {
		hash = (hash * 31 + key.charCodeAt(index)) | 0;
	}
	return Math.abs(hash);
}

function trimSlash(value: string): string {
	return value.replace(/\/$/, '');
}

function positive(value: number | undefined, fallback: number): number {
	return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : fallback;
}

function nonNegative(value: number | undefined, fallback: number): number {
	return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : fallback;
}

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
