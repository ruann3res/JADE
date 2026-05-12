import type { FeedbackCategory } from '../entities/feedback';

export function ruleIdToFeedbackCategory(ruleId: string): FeedbackCategory {
	if (ruleId.startsWith('security.')) {
		return 'security';
	}
	if (ruleId.startsWith('duplication.')) {
		return 'duplication';
	}
	if (ruleId.startsWith('bug-risk.')) {
		return 'bug';
	}
	return 'codeSmell';
}
