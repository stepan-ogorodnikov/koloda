import type { FormEvent } from "react";
import { useState } from "react";
import type { UseAutoScrollReturn } from "./use-auto-scroll";

export type UseAIChatInputOptions = {
  onSubmit: (value: string) => void | Promise<void>;
  onCancel?: () => void;
  onReset?: () => void;
  isLoading?: boolean;
  scroll: UseAutoScrollReturn;
};

export type UseAIChatInputReturn = {
  inputValue: string;
  setInputValue: (value: string) => void;
  prompt: string;
  canSubmit: boolean;
  canCancel: boolean;
  submit: () => void;
  handleSubmit: (e: FormEvent) => void;
  handleNewConversation: () => void;
};

export function useAIChatInput(
  { onSubmit, onCancel, onReset, isLoading = false, scroll }: UseAIChatInputOptions,
): UseAIChatInputReturn {
  const [inputValue, setInputValue] = useState("");
  const prompt = inputValue.trim();

  const canSubmit = !!prompt && !isLoading;
  const canCancel = isLoading && !!onCancel;

  const submit = () => {
    if (!canSubmit) return;
    const shouldFollow = scroll.prepareSubmit();
    onSubmit(prompt);
    setInputValue("");
    if (shouldFollow) scroll.startFollowingLatest("smooth");
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    submit();
  };

  const handleNewConversation = () => {
    setInputValue("");
    scroll.resetScroll();
    onReset?.();
  };

  return {
    inputValue,
    setInputValue,
    prompt,
    canSubmit,
    canCancel,
    submit,
    handleSubmit,
    handleNewConversation,
  };
}
