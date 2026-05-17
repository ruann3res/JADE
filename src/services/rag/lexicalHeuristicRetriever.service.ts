import type { FeedbackCategory } from '../../entities/feedback';
import { buildTokenSet, stripComments } from './codeTokenizer.service';
import type {
	HeuristicMatch,
	HeuristicRetriever,
	JavaHeuristic,
	RagConfig,
} from './rag.types';

const CATEGORY_PRIORITY: Record<FeedbackCategory, number> = {
	security: 0,
	bug: 1,
	duplication: 2,
	codeSmell: 3,
};

export class LexicalHeuristicRetriever implements HeuristicRetriever {
	readonly name = 'lexical';

	async retrieve(
		source: string,
		heuristics: readonly JavaHeuristic[],
		config: RagConfig,
	): Promise<HeuristicMatch[]> {
		const tokenSet = buildTokenSet(source);
		const sanitizedSource = stripComments(source);
		const matches: HeuristicMatch[] = [];

		for (const heuristic of heuristics) {
			const match = this.scoreHeuristic(heuristic, tokenSet, sanitizedSource, config);
			if (match.score >= config.minScore) {
				matches.push(match);
			}
		}

		matches.sort((a, b) => {
			if (b.score !== a.score) {
				return b.score - a.score;
			}
			const categoryDiff =
				CATEGORY_PRIORITY[a.heuristic.category] - CATEGORY_PRIORITY[b.heuristic.category];
			if (categoryDiff !== 0) {
				return categoryDiff;
			}
			return a.heuristic.id.localeCompare(b.heuristic.id);
		});

		return matches.slice(0, Math.max(0, config.topK));
	}

	private scoreHeuristic(
		heuristic: JavaHeuristic,
		tokenSet: ReadonlySet<string>,
		sanitizedSource: string,
		config: RagConfig,
	): HeuristicMatch {
		const matchedKeywords: string[] = [];
		for (const keyword of heuristic.keywords) {
			if (tokenSet.has(keyword)) {
				matchedKeywords.push(keyword);
			}
		}

		let matchedPatternCount = 0;
		if (heuristic.patterns) {
			for (const pattern of heuristic.patterns) {
				if (pattern.test(sanitizedSource)) {
					matchedPatternCount += 1;
				}
			}
		}

		const score =
			matchedKeywords.length * config.keywordScore +
			matchedPatternCount * config.patternScore;

		return { heuristic, score, matchedKeywords, matchedPatternCount };
	}
}
