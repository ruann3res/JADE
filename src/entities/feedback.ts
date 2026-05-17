export type FeedbackCategory = 'codeSmell' | 'bug' | 'security' | 'duplication';

export type FeedbackVerdict = 'valid' | 'false_positive' | 'partially_valid' | 'unclear';

export type FeedbackReason =
	| 'useful'
	| 'test_file'
	| 'missing_context'
	| 'wrong_line'
	| 'not_security_issue'
	| 'already_handled'
	| 'too_generic'
	| 'wrong_fix'
	| 'other';

export type FeedbackRecord = {
	feedbackId: string;
	timestamp: string;
	reportId: string;
	findingId: string;
	suggestionId: string;
	model: string;
	promptVersion: string;
	pluginVersion: string;
	category: FeedbackCategory;
	file: string;
	line: number | null;
	title: string;
	suggestion: string;
	reviewed: boolean;
	rating: number | null;
	verdict: FeedbackVerdict;
	reason: FeedbackReason | null;
	falsePositive: boolean;
	comment: string | null;
};
