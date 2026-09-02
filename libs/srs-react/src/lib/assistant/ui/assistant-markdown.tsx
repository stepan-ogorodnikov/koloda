import { markdownToHtml } from "@koloda/srs";

type AssistantMarkdownProps = { text: string };

export function AssistantMarkdown({ text }: AssistantMarkdownProps) {
  const html = markdownToHtml(text);
  return <div className="prose prose-chat max-w-none" dangerouslySetInnerHTML={{ __html: html }} />;
}

// WHY: module-level so `AIChatMessage` memo sees a stable `renderText` identity
// across streamed chunks and does not re-render untouched messages.
export function renderAssistantMarkdown(text: string) {
  return <AssistantMarkdown text={text} />;
}
