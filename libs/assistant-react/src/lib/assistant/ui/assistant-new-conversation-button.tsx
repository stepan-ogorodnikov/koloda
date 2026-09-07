import { BubbleChatAddIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useAtomValue } from "jotai";
import { assistantCanStartNewConversationAtom } from "../state/conversation-selectors";

export type AssistantNewConversationButtonProps = {
  onStartNewConversation: () => void;
};

export function AssistantNewConversationButton({ onStartNewConversation }: AssistantNewConversationButtonProps) {
  const { _ } = useLingui();
  // WHY: Disabled only on the param-less surface. A draft with an id and no
  // runs is still a conversation the user can leave via New.
  const canStartNewConversation = useAtomValue(assistantCanStartNewConversationAtom);

  return (
    <Button
      variants={{ style: "dashed", class: "m-2" }}
      aria-label={_(msg`ai.chat.new-conversation.label`)}
      isDisabled={!canStartNewConversation}
      onPress={onStartNewConversation}
    >
      <HugeiconsIcon className="size-5 min-w-5" strokeWidth={1.75} icon={BubbleChatAddIcon} aria-hidden="true" />
      {_(msg`ai.chat.new-conversation.label`)}
    </Button>
  );
}
