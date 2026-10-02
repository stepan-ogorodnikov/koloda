import type { Attachment } from "@koloda/srs";

export type TextInsertion = { value: string; cursor: number };

export type PastedUrl = { url: string; start: number };

export function insertAtSelection(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  text: string,
): TextInsertion {
  const start = Math.min(selectionStart, selectionEnd);
  const end = Math.max(selectionStart, selectionEnd);
  return { value: value.slice(0, start) + text + value.slice(end), cursor: start + text.length };
}

export function altFromFileName(name: string) {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(0, dot) : name;
}

export function toAttachmentImageMarkdown(alt: string, id: Attachment["id"]) {
  return `![${alt.replace(/[[\]\\]/g, "\\$&")}](attachment:${id})`;
}

export function getPastedHttpUrl(text: string) {
  const candidate = text.trim();
  if (!candidate || /\s/.test(candidate)) return null;
  try {
    const { protocol } = new URL(candidate);
    return protocol === "http:" || protocol === "https:" ? candidate : null;
  } catch {
    return null;
  }
}

export function altFromUrl(url: string) {
  const segment = new URL(url).pathname.split("/").filter(Boolean).at(-1) ?? "";
  try {
    return altFromFileName(decodeURIComponent(segment));
  } catch {
    // WHY: a malformed percent escape keeps the raw segment.
    return altFromFileName(segment);
  }
}

export function swapPastedUrl(value: string, { url, start }: PastedUrl, replacement: string): TextInsertion | null {
  if (value.slice(start, start + url.length) !== url) return null;
  return insertAtSelection(value, start, start + url.length, replacement);
}
