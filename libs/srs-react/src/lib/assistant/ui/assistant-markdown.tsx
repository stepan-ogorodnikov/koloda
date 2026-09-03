import { markdownToHtml } from "@koloda/srs";

type AssistantMarkdownProps = { text: string; muted?: boolean };

export function AssistantMarkdown({ text, muted = false }: AssistantMarkdownProps) {
  const html = markdownToHtml(text);
  return (
    <div
      className={muted ? "prose prose-chat prose-chat-muted max-w-none" : "prose prose-chat max-w-none"}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

// WHY: module-level so `AIChatMessage` / `AIToolActivity` see a stable
// `renderText` identity across streamed chunks and do not re-render
// untouched messages.
export function renderAssistantMarkdown(text: string) {
  return <AssistantMarkdown text={text} />;
}

export function renderAssistantReasoningMarkdown(text: string) {
  return <AssistantMarkdown text={text} muted />;
}
