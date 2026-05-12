export type FeedbackCategory = 'codeSmell' | 'bug' | 'security' | 'duplication';

export type FeedbackRecord = {
	timestamp: string;
	model: string;
	category: FeedbackCategory;
	file: string;
	suggestion: string;
	rating: number | null;
	falsePositive: boolean;
	comment: string | null;
};
