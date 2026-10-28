import { i18n } from "@lingui/core";
import { messages as appMessages } from "../../../../libs/app/locales/en/messages.po";
import { messages as srsReactMessages } from "../../../../libs/srs-react/locales/en/messages.po";
import { messages as srsMessages } from "../../../../libs/srs/locales/en/messages.po";
import { messages as uiMessages } from "../../../../libs/ui/locales/en/messages.po";

// WHY: the components on screen render strings from these catalogs: `@koloda/ui`, `LearnedToday` in
// `@koloda/srs-react`, and the `@koloda/srs` and `@koloda/app` labels they use. A missing one renders ids.
export function activateEnglish() {
  i18n.load("en", { ...appMessages, ...srsMessages, ...srsReactMessages, ...uiMessages });
  i18n.activate("en");
}
