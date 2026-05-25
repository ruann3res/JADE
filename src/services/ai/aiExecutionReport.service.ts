import * as fs from 'fs/promises';
import * as path from 'path';
import type { AiStructuredFix, AiSuggestionParsed } from '../../entities/aiSuggestion';
import type { AiBatchPromptDebug, AiBatchStats } from './aiBatchAnalysis.service';

export type AiExecutionKind = 'analyze' | 'fix';
export type AiExecutionStatus = 'success' | 'warning' | 'error';

export type AiExecutionReport = {
	reportId: string;
	kind: AiExecutionKind;
	status: AiExecutionStatus;
	startedAt: string;
	finishedAt: string;
	durationMs: number;
	modelId: string;
	fileName: string;
	filePath: string;
	summary: string;
	errors: string[];
	rawResponse: string;
	analysis?: {
		totalSuggestions: number;
		keptSuggestions: number;
		droppedInvalidLine: number;
		truncatedForUi: number;
		diagnosticCount: number;
		structuredFixCount: number;
		batchStats: AiBatchStats[];
		promptDebug: AiBatchPromptDebug;
		suggestions: AiSuggestionParsed[];
	};
	fix?: {
		diagnostic: {
			message: string;
			line: number;
			detail?: string;
			code?: string;
		};
		parsedFix?: AiStructuredFix;
		validation: 'applied' | 'notParsed' | 'rejectedBySafety' | 'applyFailed' | 'error';
		modelContent: string;
	};
};

export type ExportedAiExecutionReport = {
	format: 'json';
	path: string;
};

export class AiExecutionReportExporter {
	constructor(
		private readonly rootPath: string,
		private readonly outputDirectory = 'jade-ai-reports',
	) {}

	async export(report: AiExecutionReport): Promise<ExportedAiExecutionReport[]> {
		const directory = path.join(this.rootPath, this.outputDirectory, report.kind);
		await fs.mkdir(directory, { recursive: true });

		const json = JSON.stringify(report, null, 2);
		const reportPath = path.join(directory, `${report.reportId}.json`);
		const latestPath = path.join(directory, 'latest.json');
		await Promise.all([
			fs.writeFile(reportPath, json, 'utf-8'),
			fs.writeFile(latestPath, json, 'utf-8'),
		]);

		return [
			{ format: 'json', path: reportPath },
			{ format: 'json', path: latestPath },
		];
	}
}

export function buildAiExecutionReportId(kind: AiExecutionKind, startedAt: string): string {
	return `${kind}-${startedAt.replace(/[-:]/g, '').replace(/\.\d{3}Z$/, '').replace('T', '-')}`;
}
