import type {
	FormattedRagContext,
	HeuristicMatch,
	RagConfig,
	RagContextFormatter,
} from './rag.types';

export class DefaultRagContextFormatter implements RagContextFormatter {
	format(matches: readonly HeuristicMatch[], config: RagConfig): FormattedRagContext {
		if (matches.length === 0) {
			return { text: config.emptyContextMessage, truncated: false };
		}

		const lines: string[] = [config.headerLine, ''];
		const includedIds: string[] = [];
		let truncated = false;

		for (const match of matches) {
			const entry = formatHeuristicEntry(match);
			const projected = [...lines, entry].join('\n');
			if (projected.length > config.maxContextChars) {
				truncated = true;
				break;
			}
			lines.push(entry);
			includedIds.push(match.heuristic.id);
		}

		lines.push('');
		lines.push(`Retrieved: ${includedIds.join(', ') || 'none'} (truncated: ${truncated ? 'yes' : 'no'})`);

		return { text: lines.join('\n'), truncated };
	}
}

function formatHeuristicEntry(match: HeuristicMatch): string {
	const { heuristic, matchedKeywords, matchedPatternCount, score } = match;
	const evidence: string[] = [];
	if (matchedKeywords.length > 0) {
		evidence.push(`keywords: ${matchedKeywords.slice(0, 4).join(', ')}`);
	}
	if (matchedPatternCount > 0) {
		evidence.push(`patterns: ${matchedPatternCount}`);
	}
	const evidenceSuffix = evidence.length > 0 ? ` [${evidence.join('; ')}; score=${score}]` : ` [score=${score}]`;
	return `- [${heuristic.id}|${heuristic.category}] ${heuristic.title}${evidenceSuffix}\n  ${heuristic.guidance}`;
}
