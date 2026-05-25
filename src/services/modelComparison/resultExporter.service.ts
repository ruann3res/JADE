import * as fs from 'fs/promises';
import * as path from 'path';
import type { ExportedArtifact, ModelComparisonRunResult, ResultExporter } from './modelComparison.types';

export class FileSystemResultExporter implements ResultExporter {
	constructor(
		private readonly rootPath: string,
		private readonly outputDirectory = 'model-comparison-results',
	) {}

	async export(result: ModelComparisonRunResult): Promise<ExportedArtifact[]> {
		const directory = path.join(this.rootPath, this.outputDirectory);
		await fs.mkdir(directory, { recursive: true });

		const json = JSON.stringify(result, null, 2);
		const csv = toCsv(result);
		const jsonPath = path.join(directory, `${result.runId}.json`);
		const csvPath = path.join(directory, `${result.runId}.csv`);
		const latestJsonPath = path.join(directory, 'latest.json');
		const latestCsvPath = path.join(directory, 'latest.csv');

		await Promise.all([
			fs.writeFile(jsonPath, json, 'utf-8'),
			fs.writeFile(csvPath, csv, 'utf-8'),
			fs.writeFile(latestJsonPath, json, 'utf-8'),
			fs.writeFile(latestCsvPath, csv, 'utf-8'),
		]);

		return [
			{ format: 'json', path: jsonPath },
			{ format: 'csv', path: csvPath },
			{ format: 'json', path: latestJsonPath },
			{ format: 'csv', path: latestCsvPath },
		];
	}
}

function toCsv(result: ModelComparisonRunResult): string {
	const headers = [
		'runId',
		'modelId',
		'modelLabel',
		'file',
		'evaluationMode',
		'responseTimeMs',
		'rawSuggestionCount',
		'validSuggestionCount',
		'invalidSuggestionCount',
		'expectedFindingCount',
		'matchedExpectedCount',
		'usefulSuggestionCount',
		'averageFeedbackRating',
		'falsePositiveCount',
		'falsePositiveRate',
		'precision',
		'recall',
		'f1Score',
	];
	const rows = result.summary.map((row) => [
		result.runId,
		row.modelId,
		row.modelLabel,
		row.file,
		row.evaluationMode,
		row.responseTimeMs,
		row.rawSuggestionCount,
		row.validSuggestionCount,
		row.invalidSuggestionCount,
		row.expectedFindingCount ?? '',
		row.matchedExpectedCount ?? '',
		row.usefulSuggestionCount,
		row.averageFeedbackRating,
		row.falsePositiveCount,
		row.falsePositiveRate,
		row.precision ?? '',
		row.recall ?? '',
		row.f1Score ?? '',
	]);
	return [headers, ...rows].map((row) => row.map(csvEscape).join(',')).join('\n');
}

function csvEscape(value: string | number): string {
	const text = String(value);
	if (!/[",\n\r]/.test(text)) {
		return text;
	}
	return `"${text.replace(/"/g, '""')}"`;
}
