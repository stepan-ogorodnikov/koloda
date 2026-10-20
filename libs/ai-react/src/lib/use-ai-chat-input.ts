import type { FormEvent } from "react";
import type { UseAutoScrollReturn } from "./use-auto-scroll";

export type UseAIChatInputOptions = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void | Promise<void>;
  onReset?: () => void;
  canSubmit: boolean;
  scroll: UseAutoScrollReturn;
};

export type UseAIChatInputReturn = {
  inputValue: string;
  setInputValue: (value: string) => void;
  submit: () => void;
  handleSubmit: (e: FormEvent) => void;
  handleNewConversation: () => void;
};

export function useAIChatInput({
  value,
  onChange,
  onSubmit,
  onReset,
  canSubmit,
  scroll,
}: UseAIChatInputOptions): UseAIChatInputReturn {
  const submit = () => {
    // INVARIANT: Enter, the submit hotkey, and the submit button share this
    // one gate. A blocked submit must keep the composer text.
    if (!canSubmit) return;
    const shouldFollow = scroll.prepareSubmit();
    onSubmit(value.trim());
    onChange("");
    if (shouldFollow) scroll.startFollowingLatest("smooth");
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    submit();
  };

  // WHY: Composer text lives on the conversation being left. Clearing it
  // here would wipe that conversation's draft; the new conversation starts
  // with an empty `promptInput` of its own.
  const handleNewConversation = () => {
    scroll.resetScroll();
    onReset?.();
  };

  return {
    inputValue: value,
    setInputValue: onChange,
    submit,
    handleSubmit,
    handleNewConversation,
  };
}
