import DOMPurify from "dompurify";
import { marked } from "marked";

export function markdownToHtml(markdown: string): string {
  const html = marked.parse(markdown, { async: false }) as string;
  return DOMPurify.sanitize(html);
}
