import type { UseAutoScrollReturn } from "@koloda/ai-react";
import { useAppHotkey, useHotkeysSettings } from "@koloda/core-react";
import { useAtomValue, useSetAtom } from "jotai";
import type { RefObject } from "react";
import {
  assistantDeckIdAtom,
  assistantEffectiveModeAtom,
  assistantIsLockedAtom,
  assistantIsProcessingAtom,
  assistantProfileIdAtom,
  setAssistantModeAtom,
} from "./assistant-conversation-atoms";

export type UseAssistantChatHotkeysOptions = {
  handleCancel: () => void;
  handleNewConversation: () => void;
  scroll: UseAutoScrollReturn;
  profilePickerRef: RefObject<HTMLButtonElement | null>;
  modelPickerRef: RefObject<HTMLButtonElement | null>;
  deckPickerRef?: RefObject<HTMLButtonElement | null>;
  onClearDeck?: () => void;
  onPrevConversation?: () => void;
  onNextConversation?: () => void;
};

export function useAssistantChatHotkeys(
  {
    handleCancel,
    handleNewConversation,
    scroll,
    profilePickerRef,
    modelPickerRef,
    deckPickerRef,
    onClearDeck,
    onPrevConversation,
    onNextConversation,
  }: UseAssistantChatHotkeysOptions,
) {
  const { ai } = useHotkeysSettings();
  const deckId = useAtomValue(assistantDeckIdAtom);
  const isLocked = useAtomValue(assistantIsLockedAtom);
  const isProcessing = useAtomValue(assistantIsProcessingAtom);
  const profileId = useAtomValue(assistantProfileIdAtom);
  const setMode = useSetAtom(setAssistantModeAtom);
  const effectiveMode = useAtomValue(assistantEffectiveModeAtom);

  useAppHotkey(ai.cancel, () => handleCancel(), "", { enabled: isProcessing, ignoreInputs: false });
  useAppHotkey(ai.openProfilePicker, () => profilePickerRef.current?.click(), "", { ignoreInputs: false });
  useAppHotkey(ai.newConversation, handleNewConversation, "", { ignoreInputs: false });
  useAppHotkey(ai.toggleCardsMode, () => setMode(effectiveMode === "chat" ? "cards" : "chat"), "", {
    enabled: !!deckId,
    ignoreInputs: false,
  });
  useAppHotkey(ai.openModelPicker, () => modelPickerRef.current?.click(), "", {
    enabled: !!profileId,
    ignoreInputs: false,
  });
  useAppHotkey(ai.openDeckPicker, () => deckPickerRef?.current?.click(), "", {
    enabled: !isLocked,
    ignoreInputs: false,
  });
  useAppHotkey(ai.clearDeck, () => onClearDeck?.(), "", {
    enabled: !isLocked && !!deckId,
    ignoreInputs: false,
  });
  useAppHotkey(ai.previousConversation, () => onPrevConversation?.(), "", { ignoreInputs: false });
  useAppHotkey(ai.nextConversation, () => onNextConversation?.(), "", { ignoreInputs: false });
  useAppHotkey(ai.scrollUp, scroll.handleScrollUp, "", { ignoreInputs: false });
  useAppHotkey(ai.scrollDown, scroll.handleScrollDown, "", { ignoreInputs: false });
  useAppHotkey(ai.scrollToTop, scroll.handleScrollToTop, "", { ignoreInputs: false });
  useAppHotkey(ai.scrollToBottom, scroll.handleScrollToBottom, "", { ignoreInputs: false });
}
