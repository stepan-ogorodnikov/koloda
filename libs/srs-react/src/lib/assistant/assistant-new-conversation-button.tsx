import { BubbleChatAddIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useAtomValue, useSetAtom } from "jotai";
import { assistantIsProcessingAtom, assistantMessagesAtom, newConversationAtom } from "./assistant-conversation-atoms";

export type AssistantNewConversationButtonProps = {
  onConversationIdChange: (id: string) => void;
};

export function AssistantNewConversationButton({ onConversationIdChange }: AssistantNewConversationButtonProps) {
  const { _ } = useLingui();
  const messages = useAtomValue(assistantMessagesAtom);
  const isProcessing = useAtomValue(assistantIsProcessingAtom);
  const newConversation = useSetAtom(newConversationAtom);

  const canStartNewConversation = messages.length > 0 || isProcessing;

  return (
    <Button
      variants={{ style: "dashed", class: "m-2" }}
      aria-label={_(msg`ai.chat.new-conversation.label`)}
      isDisabled={!canStartNewConversation}
      onPress={() => onConversationIdChange(newConversation())}
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
