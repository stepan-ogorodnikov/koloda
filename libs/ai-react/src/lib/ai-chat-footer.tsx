import { BubbleChatAddIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { StreamUsage } from "@koloda/ai";
import { Button, Tooltip } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import type { ReactNode, RefObject } from "react";
import { AiChatContextUsage } from "./ai-chat-context-usage";
import { AIProfilePicker } from "./ai-profile-picker";

export type AIChatFooterProps = {
  profileId: string;
  onProfileChange: (value: string) => void;
  onNewConversation: () => void;
  canStartNewConversation: boolean;
  triggerRef?: RefObject<HTMLButtonElement | null>;
  contextUsage?: StreamUsage | null;
  contextLength?: number;
  settingsToggle?: ReactNode;
};

export function AIChatFooter({
  profileId,
  onProfileChange,
  onNewConversation,
  canStartNewConversation,
  triggerRef,
  contextUsage,
  contextLength,
  settingsToggle,
}: AIChatFooterProps) {
  const { _ } = useLingui();

  return (
    <div className="self-center flex flex-row items-center w-full max-w-3xl my-2 px-2 shrink-0">
      <AIProfilePicker value={profileId} onChange={onProfileChange} triggerRef={triggerRef} />
      <div className="grow min-w-3" />
      {contextUsage !== undefined && contextLength !== undefined && (
        <AiChatContextUsage usage={contextUsage} contextLength={contextLength} />
      )}
      <Tooltip
        content={_(msg`ai.chat.new-conversation.label`)}
        isDisabled={!canStartNewConversation}
      >
        <Button
          variants={{ style: "ghost", size: "icon" }}
          aria-label={_(msg`ai.chat.new-conversation.label`)}
          isDisabled={!canStartNewConversation}
          onPress={onNewConversation}
        >
          <HugeiconsIcon
            className="size-5 min-w-5"
            strokeWidth={1.75}
            icon={BubbleChatAddIcon}
            aria-hidden="true"
          />
        </Button>
      </Tooltip>
      {settingsToggle}
    </div>
  );
}
