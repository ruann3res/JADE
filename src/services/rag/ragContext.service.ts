import { DEFAULT_RAG_CONFIG } from './config/rag.defaults';
import { JAVA_HEURISTICS } from './data/javaHeuristics';
import { LexicalHeuristicRetriever } from './lexicalHeuristicRetriever.service';
import { DefaultRagContextFormatter } from './ragContextFormatter.service';
import type {
	HeuristicRetriever,
	JavaHeuristic,
	RagConfig,
	RagContextFormatter,
	RagContextResult,
} from './rag.types';

export type RagContextServiceDependencies = {
	heuristics?: readonly JavaHeuristic[];
	retriever?: HeuristicRetriever;
	formatter?: RagContextFormatter;
	config?: RagConfig;
};

export class RagContextService {
	private readonly heuristics: readonly JavaHeuristic[];
	private readonly retriever: HeuristicRetriever;
	private readonly formatter: RagContextFormatter;
	private readonly config: RagConfig;

	constructor(deps: RagContextServiceDependencies = {}) {
		this.heuristics = deps.heuristics ?? JAVA_HEURISTICS;
		this.retriever = deps.retriever ?? new LexicalHeuristicRetriever();
		this.formatter = deps.formatter ?? new DefaultRagContextFormatter();
		this.config = deps.config ?? DEFAULT_RAG_CONFIG;
	}

	async buildFromSource(source: string): Promise<RagContextResult> {
		const matches = await this.retriever.retrieve(source, this.heuristics, this.config);
		const formatted = this.formatter.format(matches, this.config);
		return {
			text: formatted.text,
			retrievedIds: matches.map((match) => match.heuristic.id),
			truncated: formatted.truncated,
			ragEnabled: true,
			retrieverName: this.retriever.name ?? 'unknown',
		};
	}
}
