import { Language } from "../entities/languages";

export function isSupportedLanguage(languageId: string): boolean {
    return Object.values(Language).includes(languageId as Language);
}