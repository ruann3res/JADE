import type { JavaHeuristic } from '../rag.types';

/**
 * Embedded catalog of Java heuristics inspired by common Sonar-style findings.
 * Only data lives here: no scoring, formatting, or retrieval logic.
 *
 * Adding a heuristic: append a new entry; keep `id` stable and unique.
 * Tuning weights or limits: edit `config/rag.defaults.ts` instead.
 */
export const JAVA_HEURISTICS: readonly JavaHeuristic[] = [
	{
		id: 'sql-injection',
		category: 'security',
		keywords: [
			'Statement',
			'createStatement',
			'executeQuery',
			'executeUpdate',
			'PreparedStatement',
			'SELECT',
			'INSERT',
			'UPDATE',
			'DELETE',
			'WHERE',
		],
		patterns: [
			/"\s*(?:SELECT|INSERT|UPDATE|DELETE|FROM|WHERE)[^"]*"\s*\+/i,
			/\+\s*\w+\s*\+\s*"\s*'/,
			/createStatement\s*\(\s*\)/,
		],
		title: 'SQL built by string concatenation',
		guidance:
			'Concatenating user-controlled values into SQL strings enables SQL injection. Use PreparedStatement with bound parameters (`?`) and never interpolate untrusted input into the query text.',
	},
	{
		id: 'unclosed-resource',
		category: 'bug',
		keywords: [
			'BufferedReader',
			'FileReader',
			'FileInputStream',
			'FileOutputStream',
			'InputStream',
			'OutputStream',
			'Scanner',
			'Connection',
			'ResultSet',
			'Socket',
		],
		patterns: [
			/new\s+(?:BufferedReader|FileReader|FileInputStream|FileOutputStream|Scanner)\s*\(/,
			/\.close\s*\(\s*\)/,
		],
		title: 'Resource may not be closed',
		guidance:
			'I/O, DB, and socket resources must be released deterministically. Use try-with-resources for any `AutoCloseable`; do not rely on the caller to close objects returned from a method.',
	},
	{
		id: 'swallowed-exception',
		category: 'codeSmell',
		keywords: ['catch', 'Exception', 'Throwable', 'RuntimeException'],
		patterns: [
			/catch\s*\([^)]*\)\s*\{\s*\}/,
			/catch\s*\([^)]*\)\s*\{\s*\/\/[^\n]*\n\s*\}/,
		],
		title: 'Exception is caught but ignored',
		guidance:
			'Empty or comment-only catch blocks hide failures and make incidents impossible to diagnose. Log the exception with context, rethrow, or convert it into a meaningful domain error.',
	},
	{
		id: 'null-dereference',
		category: 'bug',
		keywords: ['null', 'Optional', 'Objects.requireNonNull', 'NullPointerException'],
		patterns: [
			/\b\w+\.(?:length|size|isEmpty|equals|toString|trim|charAt)\s*\(/,
			/Optional\.\s*get\s*\(\s*\)/,
		],
		title: 'Possible null dereference',
		guidance:
			'Method parameters and external return values may be null. Validate inputs (`Objects.requireNonNull`, explicit null checks) or model absence with `Optional` and avoid `Optional.get()` without `isPresent()`.',
	},
	{
		id: 'hardcoded-secret',
		category: 'security',
		keywords: ['apiKey', 'api_key', 'password', 'secret', 'token', 'Bearer', 'sk_live', 'sk_test'],
		patterns: [
			/"(?:sk_live|sk_test|AKIA|ghp_|xox[baprs]-)[A-Za-z0-9_\-]{8,}"/,
			/(?:password|secret|apiKey|api_key|token)\s*=\s*"[^"]{6,}"/i,
		],
		title: 'Credential appears hardcoded in source',
		guidance:
			'Embedding keys, tokens, or passwords in source risks leaks via VCS and binaries. Read secrets from environment variables or a secure configuration provider, and rotate any value already committed.',
	},
	{
		id: 'high-complexity',
		category: 'codeSmell',
		keywords: ['switch'],
		patterns: [
			/(?:if\s*\([^)]*\)[\s\S]{0,200}?\}\s*){4,}/,
			/\?\s*[^:;]+:\s*[^;]+\?\s*[^:;]+:/,
		],
		title: 'Method has high branching complexity',
		guidance:
			'A long chain of conditionals or nested ternaries is hard to test and evolve. Extract guard clauses, replace branches with polymorphism, or split the method into smaller responsibilities.',
	},
	{
		id: 'duplicated-block',
		category: 'duplication',
		keywords: [],
		patterns: [/((?:\bint|\blong|\bdouble|\bString)\s+\w+\s*=\s*[^;]+;\s*){3,}/],
		title: 'Repeated calculation or block structure',
		guidance:
			'Sequences of nearly identical statements drift over time and double the cost of every change. Extract the shared logic into a private method or a small helper class.',
	},
	{
		id: 'fragile-collection-access',
		category: 'codeSmell',
		keywords: ['List', 'Map', 'Set', 'Iterator', 'ConcurrentModificationException'],
		patterns: [
			/\.get\s*\(\s*0\s*\)/,
			/for\s*\([^)]*:\s*\w+\s*\)\s*\{[\s\S]*?\.remove\s*\(/,
		],
		title: 'Fragile use of collections',
		guidance:
			'Indexed access without size checks throws `IndexOutOfBoundsException`, and mutating a collection while iterating throws `ConcurrentModificationException`. Guard with explicit checks or use `Iterator.remove()` / a copy.',
	},
	{
		id: 'missing-input-validation',
		category: 'security',
		keywords: ['request', 'param', 'getParameter', 'input', 'body', 'query'],
		patterns: [
			/getParameter\s*\(/,
			/@RequestParam|@PathVariable|@RequestBody/,
		],
		title: 'External input used without validation',
		guidance:
			'Values from HTTP, CLI, or external systems must be validated for type, length, and allowed characters before use. Reject or sanitize at the boundary and never trust untyped strings.',
	},
	{
		id: 'long-method',
		category: 'codeSmell',
		keywords: [],
		patterns: [/(?:public|private|protected)[^;{]*\{[\s\S]{1200,}?\}/],
		title: 'Method is too long',
		guidance:
			'Methods spanning many lines mix concerns and resist unit testing. Extract cohesive blocks into well-named helpers and keep each method focused on a single responsibility.',
	},
];
