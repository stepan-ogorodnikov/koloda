import { BubbleChatAddIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useAtomValue, useSetAtom } from "jotai";
import { assistantHasContextAtom, newConversationAtom } from "./assistant-conversation-atoms";
import { useGlobalAIProfileState } from "./use-global-ai-profile-state";

export type AssistantNewConversationButtonProps = {
  onConversationIdChange: (id: string) => void;
};

export function AssistantNewConversationButton({ onConversationIdChange }: AssistantNewConversationButtonProps) {
  const { _ } = useLingui();
  // WHY: Revert hides messages but the conversation is still saved. The
  // "no point in a second empty conversation" check must look at the
  // underlying state, not the user-visible prefix, otherwise revert
  // would let the user spawn an empty conversation.
  const hasContext = useAtomValue(assistantHasContextAtom);
  const newConversation = useSetAtom(newConversationAtom);
  const [globalAIProfileState] = useGlobalAIProfileState();

  const canStartNewConversation = hasContext;

  return (
    <Button
      variants={{ style: "dashed", class: "m-2" }}
      aria-label={_(msg`ai.chat.new-conversation.label`)}
      isDisabled={!canStartNewConversation}
      onPress={() => onConversationIdChange(newConversation(globalAIProfileState))}
    >
      <HugeiconsIcon className="size-5 min-w-5" strokeWidth={1.75} icon={BubbleChatAddIcon} aria-hidden="true" />
      {_(msg`ai.chat.new-conversation.label`)}
    </Button>
  );
}
