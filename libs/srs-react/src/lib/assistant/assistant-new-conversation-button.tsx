import { BubbleChatAddIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";

import { useAssistantChatContext } from "./assistant-chat-context";

export function AssistantNewConversationButton() {
  const { _ } = useLingui();
  const { handleReset, isGenerating, messages } = useAssistantChatContext();

  const canStartNewConversation = messages.length > 0 || isGenerating;

  return (
    <Button
      variants={{ style: "dashed", class: "m-2" }}
      aria-label={_(msg`ai.chat.new-conversation.label`)}
      isDisabled={!canStartNewConversation}
      onPress={handleReset}
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
