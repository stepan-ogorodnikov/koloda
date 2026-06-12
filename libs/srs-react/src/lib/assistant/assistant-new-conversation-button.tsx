import { BubbleChatAddIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useAtomValue, useSetAtom } from "jotai";
import {
  assistantIsProcessingAtom,
  assistantMessagesAtom,
  resetAssistantConversationAtom,
} from "./assistant-conversation-atoms";

export function AssistantNewConversationButton() {
  const { _ } = useLingui();
  const messages = useAtomValue(assistantMessagesAtom);
  const isProcessing = useAtomValue(assistantIsProcessingAtom);
  const reset = useSetAtom(resetAssistantConversationAtom);

  const canStartNewConversation = messages.length > 0 || isProcessing;

  return (
    <Button
      variants={{ style: "dashed", class: "m-2" }}
      aria-label={_(msg`ai.chat.new-conversation.label`)}
      isDisabled={!canStartNewConversation}
      onPress={reset}
    >
      <HugeiconsIcon
        className="size-5 min-w-5"
        strokeWidth={1.75}
        icon={BubbleChatAddIcon}
        aria-hidden="true"
      />
      {_(msg`ai.chat.new-conversation.label`)}
    </Button>
  );
}
