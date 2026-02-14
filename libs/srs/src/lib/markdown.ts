import DOMPurify from "dompurify";
import { marked } from "marked";

export function markdownToHtml(markdown: string): string {
  const html = marked.parse(markdown, { async: false }) as string;
  return DOMPurify.sanitize(html);
}

export function markdownToText(markdown: string): string {
  const html = markdownToHtml(markdown);
  return html.replace(/<[^>]*>/g, "").trim();
}

export function isMarkdownEmpty(markdown: string): boolean {
  if (!markdown || !markdown.trim()) return true;
  const text = markdownToText(markdown);
  return text.length === 0;
}
