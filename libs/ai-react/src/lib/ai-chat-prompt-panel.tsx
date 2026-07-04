import type { FormEvent, PropsWithChildren } from "react";

const aiChatPromptPanel = [
  "flex flex-col gap-2 shrink-0 w-full max-w-3xl mx-auto",
  "rounded-2xl border-2 border-input bg-input shadow-input",
].join(" ");

export type AIChatPromptPanelProps = PropsWithChildren & {
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
};

export function AIChatPromptPanel({ onSubmit, children }: AIChatPromptPanelProps) {
  return (
    <form className={aiChatPromptPanel} onSubmit={onSubmit}>
      {children}
    </form>
  );
}
