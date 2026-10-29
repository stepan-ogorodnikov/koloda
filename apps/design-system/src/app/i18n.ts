import { getLanguageCode } from "@koloda/app";
import { i18n } from "@lingui/core";
import type { Messages } from "@lingui/core";
import { detect, fromNavigator, fromStorage } from "@lingui/detect-locale";
import { messages as aiReactEn } from "../../../../libs/ai-react/locales/en/messages.po";
import { messages as aiReactRu } from "../../../../libs/ai-react/locales/ru/messages.po";
import { messages as aiEn } from "../../../../libs/ai/locales/en/messages.po";
import { messages as aiRu } from "../../../../libs/ai/locales/ru/messages.po";
import { messages as appReactEn } from "../../../../libs/app-react/locales/en/messages.po";
import { messages as appReactRu } from "../../../../libs/app-react/locales/ru/messages.po";
import { messages as appEn } from "../../../../libs/app/locales/en/messages.po";
import { messages as appRu } from "../../../../libs/app/locales/ru/messages.po";
import { messages as assistantReactEn } from "../../../../libs/assistant-react/locales/en/messages.po";
import { messages as assistantReactRu } from "../../../../libs/assistant-react/locales/ru/messages.po";
import { messages as settingsReactEn } from "../../../../libs/settings-react/locales/en/messages.po";
import { messages as settingsReactRu } from "../../../../libs/settings-react/locales/ru/messages.po";
import { messages as srsReactEn } from "../../../../libs/srs-react/locales/en/messages.po";
import { messages as srsReactRu } from "../../../../libs/srs-react/locales/ru/messages.po";
import { messages as srsEn } from "../../../../libs/srs/locales/en/messages.po";
import { messages as srsRu } from "../../../../libs/srs/locales/ru/messages.po";
import { messages as uiEn } from "../../../../libs/ui/locales/en/messages.po";
import { messages as uiRu } from "../../../../libs/ui/locales/ru/messages.po";

// WHY: the components on screen render strings from these catalogs: `@koloda/ui`, the srs, assistant, and settings
// feature libs, and the domain labels and errors they use. A missing one renders message ids.
// `@koloda/app-react` supplies the nav, page title, and settings labels the design-system reuses.
const catalogs: Record<string, Messages> = {
  en: {
    ...appEn,
    ...appReactEn,
    ...srsEn,
    ...srsReactEn,
    ...aiEn,
    ...aiReactEn,
    ...assistantReactEn,
    ...settingsReactEn,
    ...uiEn,
  },
  ru: {
    ...appRu,
    ...appReactRu,
    ...srsRu,
    ...srsReactRu,
    ...aiRu,
    ...aiReactRu,
    ...assistantReactRu,
    ...settingsReactRu,
    ...uiRu,
  },
};

export function getLanguage() {
  return getLanguageCode(detect(fromStorage("lang"), fromNavigator())) as string;
}

export function activateLanguage(locale: string) {
  i18n.load(locale, catalogs[locale]);
  i18n.activate(locale);
}
