import type { UponSanitizeAttributeHookEvent } from "dompurify";
import DOMPurify from "dompurify";
import { marked } from "marked";

// WHY: A remote image URL is fetched as soon as the markdown is shown, so a
// prompt injection can carry card text out in the query string. Links stay;
// they wait for a click. Only relative URLs stay: data: URLs go too, because
// inline image bytes bloat the text that every card read loads.
const RELATIVE_IMAGE_BASE = "https://koloda.invalid";

const AUTO_LOAD_ATTRS = new Set(["src", "poster", "background"]);
const SVG_IMAGE_TAGS = new Set(["image", "feimage"]);

export function markdownToHtml(markdown: string): string {
  const html = marked.parse(markdown, { async: false }) as string;
  // WHY: CSS can load a remote image via url(), from a <style> tag or a style attribute.
  return DOMPurify.sanitize(html, { FORBID_TAGS: ["style"], FORBID_ATTR: ["style"] });
}

function isSafeImageUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value.trim(), RELATIVE_IMAGE_BASE);
  } catch {
    return false;
  }
  return url.origin === RELATIVE_IMAGE_BASE;
}

function dropRemoteImageUrl(node: Element, data: UponSanitizeAttributeHookEvent): void {
  const attr = data.attrName.toLowerCase();
  // WHY: srcset candidates are comma-separated and data URLs contain commas.
  if (attr === "srcset") {
    data.keepAttr = false;
    return;
  }
  const tag = node.tagName.toLowerCase();
  const svgImageLink = (attr === "href" || attr === "xlink:href") && SVG_IMAGE_TAGS.has(tag);
  if (!AUTO_LOAD_ATTRS.has(attr) && !svgImageLink) return;
  if (!isSafeImageUrl(data.attrValue)) data.keepAttr = false;
}

// WHY: Without a DOM (node-environment tests import this module), DOMPurify
// returns early and never defines addHook.
if (DOMPurify.isSupported) {
  DOMPurify.addHook("uponSanitizeAttribute", dropRemoteImageUrl);
}
