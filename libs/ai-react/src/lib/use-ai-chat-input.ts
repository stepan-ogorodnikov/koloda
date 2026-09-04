import type { FormEvent } from "react";
import type { UseAutoScrollReturn } from "./use-auto-scroll";

export type UseAIChatInputOptions = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void | Promise<void>;
  onReset?: () => void;
  isLoading?: boolean;
  scroll: UseAutoScrollReturn;
};

export type UseAIChatInputReturn = {
  inputValue: string;
  setInputValue: (value: string) => void;
  prompt: string;
  canSubmit: boolean;
  submit: () => void;
  handleSubmit: (e: FormEvent) => void;
  handleNewConversation: () => void;
};

export function useAIChatInput({
  value,
  onChange,
  onSubmit,
  onReset,
  isLoading = false,
  scroll,
}: UseAIChatInputOptions): UseAIChatInputReturn {
  const prompt = value.trim();

  const canSubmit = !!prompt && !isLoading;

  const submit = () => {
    if (!canSubmit) return;
    const shouldFollow = scroll.prepareSubmit();
    onSubmit(prompt);
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
    prompt,
    canSubmit,
    submit,
    handleSubmit,
    handleNewConversation,
  };
}
