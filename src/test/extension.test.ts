import * as assert from 'assert';

import * as vscode from 'vscode';
import { createJavaSourceBatches } from '../services/ai/aiBatchAnalysis.service';
import { parseAiSuggestionsJson } from '../services/ai/promptBuilder.service';

suite('Extension Test Suite', () => {
	vscode.window.showInformationMessage('Start all tests.');

	test('Sample test', () => {
		assert.strictEqual(-1, [1, 2, 3].indexOf(5));
		assert.strictEqual(-1, [1, 2, 3].indexOf(0));
	});

	test('parseAiSuggestionsJson accepts string ranges as the anchor line', () => {
		const parsed = parseAiSuggestionsJson('{"suggestions":[{"id":"1","line":"108-134","category":"Security","summary":"SQL injection","detail":"Use prepared statements."}]}');

		assert.strictEqual(parsed.structuredJsonEnvelope, true);
		assert.strictEqual(parsed.suggestions.length, 1);
		assert.strictEqual(parsed.suggestions[0].line, 108);
		assert.strictEqual(parsed.suggestions[0].category, 'security');
	});

	test('createJavaSourceBatches splits by line count with overlap', () => {
		const source = Array.from({ length: 5 }, (_, index) => `line ${index + 1}`).join('\n');
		const batches = createJavaSourceBatches(source, { maxLines: 3, overlapLines: 1 });

		assert.deepStrictEqual(
			batches.map((batch) => [batch.lineStart, batch.lineEnd, batch.source]),
			[
				[1, 3, 'line 1\nline 2\nline 3'],
				[3, 5, 'line 3\nline 4\nline 5'],
			],
		);
	});
});
