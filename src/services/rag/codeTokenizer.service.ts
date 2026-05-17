/**
 * Lightweight Java tokenizer for lexical retrieval.
 * Strips block/line comments and tokenizes on non-word boundaries,
 * preserving original casing so identifiers like `PreparedStatement`
 * can still be matched verbatim.
 */
export function tokenizeJavaSource(source: string): string[] {
	if (source.length === 0) {
		return [];
	}
	const withoutComments = stripComments(source);
	const tokens: string[] = [];
	const regex = /[A-Za-z_$][A-Za-z0-9_$]*/g;
	let match: RegExpExecArray | null;
	while ((match = regex.exec(withoutComments)) !== null) {
		tokens.push(match[0]);
	}
	return tokens;
}

/** Returns the source with `//` line comments and `/* ... *\/` blocks removed. */
export function stripComments(source: string): string {
	return source
		.replace(/\/\*[\s\S]*?\*\//g, ' ')
		.replace(/\/\/[^\n]*/g, ' ');
}

/** Builds a `Set` of unique tokens for O(1) keyword presence checks. */
export function buildTokenSet(source: string): Set<string> {
	return new Set(tokenizeJavaSource(source));
}
