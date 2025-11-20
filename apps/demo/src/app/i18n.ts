import { getLanguageCode, LOCALES } from "@koloda/srs";
import { i18n } from "@lingui/core";
import { detect, fromNavigator, fromStorage } from "@lingui/detect-locale";

export function getLanguage() {
  return getLanguageCode(detect(fromStorage("lang"), fromNavigator())) as string;
}

export async function activateLanguage(locale: string) {
  if (LOCALES.includes(locale)) {
    const { messages } = await import(`./locales/${locale}.ts`);
    i18n.load(locale, messages);
    i18n.activate(locale);
  }
}
