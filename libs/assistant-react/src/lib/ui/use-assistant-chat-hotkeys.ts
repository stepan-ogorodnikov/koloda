import type { UseAutoScrollReturn } from "@koloda/ai-react";
import { useAppHotkey, useHotkeysSettings } from "@koloda/core-react";
import { useAtomValue } from "jotai";
import type { RefObject } from "react";
import { assistantCanStartNewConversationAtom, assistantIsProcessingAtom } from "../state/conversation-selectors";

export type UseAssistantChatHotkeysOptions = {
  handleCancel: () => void;
  handleNewConversation: () => void;
  scroll: UseAutoScrollReturn;
  modelProfilePickerRef: RefObject<HTMLButtonElement | null>;
  onPrevConversation?: () => void;
  onNextConversation?: () => void;
};

export function useAssistantChatHotkeys({
  handleCancel,
  handleNewConversation,
  scroll,
  modelProfilePickerRef,
  onPrevConversation,
  onNextConversation,
}: UseAssistantChatHotkeysOptions) {
  const { ai } = useHotkeysSettings();
  const isProcessing = useAtomValue(assistantIsProcessingAtom);
  const canStartNewConversation = useAtomValue(assistantCanStartNewConversationAtom);

  useAppHotkey(ai.cancel, () => handleCancel(), "", { enabled: isProcessing, ignoreInputs: false });
  // WHY: Same gate as AssistantNewConversationButton. On the param-less
  // surface there is no conversation id; New would mint a second empty one
  // (ASSISTANT-CONVERSATIONS.md §Conversation List).
  useAppHotkey(ai.newConversation, handleNewConversation, "", {
    enabled: canStartNewConversation,
    ignoreInputs: false,
  });
  useAppHotkey(ai.openModelPicker, () => modelProfilePickerRef.current?.click(), "", {
    ignoreInputs: false,
  });
  useAppHotkey(ai.previousConversation, () => onPrevConversation?.(), "", { ignoreInputs: false });
  useAppHotkey(ai.nextConversation, () => onNextConversation?.(), "", { ignoreInputs: false });
  useAppHotkey(ai.scrollUp, scroll.handleScrollUp, "", { ignoreInputs: false });
  useAppHotkey(ai.scrollDown, scroll.handleScrollDown, "", { ignoreInputs: false });
  useAppHotkey(ai.scrollToTop, scroll.handleScrollToTop, "", { ignoreInputs: false });
  useAppHotkey(ai.scrollToBottom, scroll.handleScrollToBottom, "", { ignoreInputs: false });
}
