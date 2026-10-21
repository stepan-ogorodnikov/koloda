import type { UseAutoScrollReturn } from "@koloda/ai-react";
import { useAppHotkey, useHotkeysSettings } from "@koloda/core-react";
import { useAtomValue } from "jotai";
import type { RefObject } from "react";
import { assistantIsProcessingAtom } from "../state/conversation-selectors";

export type UseAssistantChatHotkeysOptions = {
  conversationId: string | undefined;
  handleCancel: () => void;
  handleNewConversation: () => void;
  scroll: UseAutoScrollReturn;
  modelProfilePickerRef: RefObject<HTMLButtonElement | null>;
  onToggleSettings: () => void;
  onPrevConversation?: () => void;
  onNextConversation?: () => void;
};

export function useAssistantChatHotkeys({
  conversationId,
  handleCancel,
  handleNewConversation,
  scroll,
  modelProfilePickerRef,
  onToggleSettings,
  onPrevConversation,
  onNextConversation,
}: UseAssistantChatHotkeysOptions) {
  const { ai } = useHotkeysSettings();
  const isProcessing = useAtomValue(assistantIsProcessingAtom);

  useAppHotkey(ai.cancel, () => handleCancel(), "", { enabled: isProcessing, ignoreInputs: false });
  // WHY: Same gate as AssistantNewConversationButton. On the param-less
  // surface there is no conversation id; New would mint a second empty one
  // (ASSISTANT-CONVERSATION-LIST.md (§Conversation List)).
  useAppHotkey(ai.newConversation, handleNewConversation, "", {
    enabled: !!conversationId,
    ignoreInputs: false,
  });
  useAppHotkey(ai.openModelPicker, () => modelProfilePickerRef.current?.click(), "", {
    ignoreInputs: false,
  });
  useAppHotkey(ai.toggleSettings, onToggleSettings, "", { ignoreInputs: false });
  useAppHotkey(ai.previousConversation, () => onPrevConversation?.(), "", { ignoreInputs: false });
  useAppHotkey(ai.nextConversation, () => onNextConversation?.(), "", { ignoreInputs: false });
  useAppHotkey(ai.scrollUp, scroll.handleScrollUp, "", { ignoreInputs: false });
  useAppHotkey(ai.scrollDown, scroll.handleScrollDown, "", { ignoreInputs: false });
  useAppHotkey(ai.scrollToTop, scroll.handleScrollToTop, "", { ignoreInputs: false });
  useAppHotkey(ai.scrollToBottom, scroll.handleScrollToBottom, "", { ignoreInputs: false });
}
