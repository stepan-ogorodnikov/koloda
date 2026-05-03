import { useAppHotkey, useHotkeysSettings } from "@koloda/core-react";
import { TextField } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { type KeyboardEvent, useRef } from "react";

export type AIChatPromptInputProps = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
};

export function AIChatPromptInput({ value, onChange, onSubmit }: AIChatPromptInputProps) {
  const { _ } = useLingui();
  const { ui } = useHotkeysSettings();
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) {
      e.preventDefault();
      onSubmit();
    }
  };

  useAppHotkey(
    ui.submit,
    () => {
      if (document.activeElement === inputRef.current) onSubmit();
    },
    "",
    { ignoreInputs: false, conflictBehavior: "allow" },
  );

  return (
    <TextField
      variants={{ class: "rounded-2xl" }}
      aria-label={_(msg`ai.chat.input.label`)}
      value={value}
      onChange={onChange}
      autoFocus
    >
      <TextField.TextArea
        variants={{ style: "inline", class: "resize-none" }}
        rows={4}
        placeholder={_(msg`ai.chat.input.placeholder`)}
        ref={inputRef}
        onKeyDownCapture={handleKeyDown}
      />
    </TextField>
  );
}
