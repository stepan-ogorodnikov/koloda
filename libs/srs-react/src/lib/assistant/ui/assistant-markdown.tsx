import { markdownToHtml } from "@koloda/srs";
import { tv } from "tailwind-variants";

const assistantMarkdown = tv({
  base: "prose prose-chat max-w-none",
  variants: {
    isMuted: { true: "prose-chat-muted" },
  },
  defaultVariants: {
    isMuted: false,
  },
});

type AssistantMarkdownProps = { text: string; isMuted?: boolean };

export function AssistantMarkdown({ text, isMuted = false }: AssistantMarkdownProps) {
  const html = markdownToHtml(text);
  return <div className={assistantMarkdown({ isMuted })} dangerouslySetInnerHTML={{ __html: html }} />;
}

// WHY: module-level so `AIChatMessage` / `AIToolActivity` see a stable
// `renderText` identity across streamed chunks and do not re-render
// untouched messages.
export function renderAssistantMarkdown(text: string) {
  return <AssistantMarkdown text={text} />;
}

export function renderAssistantReasoningMarkdown(text: string) {
  return <AssistantMarkdown text={text} isMuted />;
}
