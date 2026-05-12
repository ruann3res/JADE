import * as vscode from 'vscode';
import { Language } from '../../entities/languages';
import { isSupportedLanguage } from '../../utils/language-selector';

export class LanguageGuardService {
	isJava(document: vscode.TextDocument): boolean {
		return isSupportedLanguage(document.languageId) || document.uri.fsPath.toLowerCase().endsWith('.java');
	}

	supportedLanguagesMessage(): string {
		const supportedLanguages = Object.values(Language).map((language) => language.toString());
		return `Only ${supportedLanguages.join(', ')} files are supported for analysis at the moment.`;
	}
}
