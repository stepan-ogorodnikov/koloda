import type { StreamUsage } from "@koloda/ai";
import type { ReactNode, RefObject } from "react";
import { AiChatContextUsage } from "./ai-chat-context-usage";
import { AIProfilePicker } from "./ai-profile-picker";

export type AIChatFooterProps = {
  profileId: string;
  onProfileChange: (value: string) => void;
  triggerRef?: RefObject<HTMLButtonElement | null>;
  contextUsage?: StreamUsage | null;
  contextLength?: number;
  settingsToggle?: ReactNode;
};

export function AIChatFooter({
  profileId,
  onProfileChange,
  triggerRef,
  contextUsage,
  contextLength,
  settingsToggle,
}: AIChatFooterProps) {
  return (
    <div className="self-center flex flex-row items-center w-full max-w-3xl my-2 px-2 shrink-0">
      <AIProfilePicker value={profileId} onChange={onProfileChange} triggerRef={triggerRef} />
      <div className="grow min-w-3" />
      {contextUsage !== undefined && contextLength !== undefined && (
        <AiChatContextUsage usage={contextUsage} contextLength={contextLength} />
      )}
      {settingsToggle}
    </div>
  );
}
