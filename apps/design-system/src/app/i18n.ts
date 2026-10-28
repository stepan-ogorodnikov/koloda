import { i18n } from "@lingui/core";
import { messages as appMessages } from "../../../../libs/app/locales/en/messages.po";
import { messages as uiMessages } from "../../../../libs/ui/locales/en/messages.po";

// WHY: `@koloda/ui` renders strings from its own catalog and from `@koloda/app` (form errors).
// Without both, those labels render as message ids.
export function activateEnglish() {
  i18n.load("en", { ...appMessages, ...uiMessages });
  i18n.activate("en");
}
