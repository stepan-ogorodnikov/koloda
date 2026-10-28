import { i18n } from "@lingui/core";
import { messages as aiReactMessages } from "../../../../libs/ai-react/locales/en/messages.po";
import { messages as aiMessages } from "../../../../libs/ai/locales/en/messages.po";
import { messages as appMessages } from "../../../../libs/app/locales/en/messages.po";
import { messages as assistantReactMessages } from "../../../../libs/assistant-react/locales/en/messages.po";
import { messages as srsReactMessages } from "../../../../libs/srs-react/locales/en/messages.po";
import { messages as srsMessages } from "../../../../libs/srs/locales/en/messages.po";
import { messages as uiMessages } from "../../../../libs/ui/locales/en/messages.po";

// WHY: the components on screen render strings from these catalogs: `@koloda/ui`, the srs and assistant
// feature libs, and the domain labels and errors they use. A missing one renders message ids.
export function activateEnglish() {
  i18n.load("en", {
    ...appMessages,
    ...srsMessages,
    ...srsReactMessages,
    ...aiMessages,
    ...aiReactMessages,
    ...assistantReactMessages,
    ...uiMessages,
  });
  i18n.activate("en");
}
