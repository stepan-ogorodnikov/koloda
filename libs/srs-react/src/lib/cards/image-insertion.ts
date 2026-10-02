import type { Attachment } from "@koloda/srs";

export type TextInsertion = { value: string; cursor: number };

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
