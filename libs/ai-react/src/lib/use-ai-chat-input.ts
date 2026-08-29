import type { FormEvent } from "react";
import { useState } from "react";
import type { UseAutoScrollReturn } from "./use-auto-scroll";

export type UseAIChatInputOptions = {
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
  onSubmit,
  onReset,
  isLoading = false,
  scroll,
}: UseAIChatInputOptions): UseAIChatInputReturn {
  const [inputValue, setInputValue] = useState("");
  const prompt = inputValue.trim();

  const canSubmit = !!prompt && !isLoading;

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
    submit,
    handleSubmit,
    handleNewConversation,
  };
}
