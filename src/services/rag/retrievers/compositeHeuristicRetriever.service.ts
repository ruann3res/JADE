import type {
	HeuristicMatch,
	HeuristicRetriever,
	JavaHeuristic,
	RagConfig,
} from '../rag.types';

export type CompositeFailureLogger = (event: {
	primary: string;
	fallback: string;
	error: Error;
}) => void;

export type CompositeHeuristicRetrieverDependencies = {
	primary: HeuristicRetriever;
	fallback: HeuristicRetriever;
	onPrimaryFailure?: CompositeFailureLogger;
};

/**
 * Tries the primary retriever first; on error returns the fallback retriever's matches.
 * `name` exposed on the result reflects whichever retriever actually produced the matches.
 */
export class CompositeHeuristicRetriever implements HeuristicRetriever {
	private readonly primary: HeuristicRetriever;
	private readonly fallback: HeuristicRetriever;
	private readonly onPrimaryFailure?: CompositeFailureLogger;
	private lastUsed: string;

	constructor(deps: CompositeHeuristicRetrieverDependencies) {
		this.primary = deps.primary;
		this.fallback = deps.fallback;
		this.onPrimaryFailure = deps.onPrimaryFailure;
		this.lastUsed = deps.primary.name ?? 'primary';
	}

	get name(): string {
		return this.lastUsed;
	}

	async retrieve(
		source: string,
		heuristics: readonly JavaHeuristic[],
		config: RagConfig,
	): Promise<HeuristicMatch[]> {
		try {
			const matches = await this.primary.retrieve(source, heuristics, config);
			this.lastUsed = this.primary.name ?? 'primary';
			return matches;
		} catch (error) {
			const wrapped = error instanceof Error ? error : new Error(String(error));
			this.onPrimaryFailure?.({
				primary: this.primary.name ?? 'primary',
				fallback: this.fallback.name ?? 'fallback',
				error: wrapped,
			});
			this.lastUsed = this.fallback.name ?? 'fallback';
			return this.fallback.retrieve(source, heuristics, config);
		}
	}
}
