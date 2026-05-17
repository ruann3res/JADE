import * as crypto from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
import type { FeedbackCategory } from '../../entities/feedback';
import type { ExpectedFinding, ModelComparisonSample, SampleRepository } from './modelComparison.types';

const VALID_CATEGORIES: FeedbackCategory[] = ['codeSmell', 'bug', 'security', 'duplication'];
const DEFAULT_SAMPLES_DIRECTORY = 'samples/model-comparison';
const DEFAULT_EXPECTED_FINDINGS_FILE = 'expected-findings.json';

export class FileSampleRepository implements SampleRepository {
	constructor(
		private readonly rootPath: string,
		private readonly samplesDirectory = DEFAULT_SAMPLES_DIRECTORY,
		private readonly expectedFindingsFile = DEFAULT_EXPECTED_FINDINGS_FILE,
	) {}

	async loadSamples(): Promise<ModelComparisonSample[]> {
		const directory = path.join(this.rootPath, this.samplesDirectory);
		const expected = await loadExpectedFindings(path.join(directory, this.expectedFindingsFile));
		const entries = await fs.readdir(directory, { withFileTypes: true });
		const javaFiles = entries
			.filter((entry) => entry.isFile() && entry.name.endsWith('.java'))
			.map((entry) => entry.name)
			.sort((a, b) => a.localeCompare(b));

		if (javaFiles.length === 0) {
			throw new Error(`No Java samples found in ${directory}`);
		}

		return Promise.all(
			javaFiles.map(async (fileName) => {
				const absolutePath = path.join(directory, fileName);
				const source = await fs.readFile(absolutePath, 'utf-8');
				return {
					fileName,
					relativePath: path.join(this.samplesDirectory, fileName),
					source,
					lineCount: countLines(source),
					sha256: sha256(source),
					evaluationMode: 'groundTruth',
					expectedFindings: expected.filter((finding) => finding.file === fileName),
				};
			}),
		);
	}
}

export class InMemorySampleRepository implements SampleRepository {
	constructor(private readonly samples: ModelComparisonSample[]) {}

	async loadSamples(): Promise<ModelComparisonSample[]> {
		return this.samples;
	}
}

export function sha256(value: string): string {
	return crypto.createHash('sha256').update(value, 'utf-8').digest('hex');
}

async function loadExpectedFindings(filePath: string): Promise<ExpectedFinding[]> {
	const raw = await fs.readFile(filePath, 'utf-8');
	const parsed = JSON.parse(raw) as unknown;
	if (!Array.isArray(parsed)) {
		throw new Error(`${filePath} must contain an array of expected findings`);
	}
	return parsed.map((item, index) => normalizeExpectedFinding(item, index, filePath));
}

function normalizeExpectedFinding(item: unknown, index: number, filePath: string): ExpectedFinding {
	if (!item || typeof item !== 'object') {
		throw new Error(`Invalid expected finding at index ${index} in ${filePath}`);
	}
	const raw = item as Record<string, unknown>;
	return {
		id: readString(raw.id, 'id', index, filePath),
		file: readString(raw.file, 'file', index, filePath),
		line: readPositiveInteger(raw.line, 'line', index, filePath),
		category: readCategory(raw.category, index, filePath),
		summary: readString(raw.summary, 'summary', index, filePath),
		rationale: readString(raw.rationale, 'rationale', index, filePath),
	};
}

function readString(value: unknown, field: string, index: number, filePath: string): string {
	if (typeof value !== 'string' || value.trim().length === 0) {
		throw new Error(`Expected finding ${index} in ${filePath} has invalid ${field}`);
	}
	return value.trim();
}

function readPositiveInteger(value: unknown, field: string, index: number, filePath: string): number {
	if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
		throw new Error(`Expected finding ${index} in ${filePath} has invalid ${field}`);
	}
	return value;
}

function readCategory(value: unknown, index: number, filePath: string): FeedbackCategory {
	if (typeof value !== 'string' || !VALID_CATEGORIES.includes(value as FeedbackCategory)) {
		throw new Error(`Expected finding ${index} in ${filePath} has invalid category`);
	}
	return value as FeedbackCategory;
}

function countLines(source: string): number {
	return source.length === 0 ? 1 : source.split(/\r?\n/).length;
}
