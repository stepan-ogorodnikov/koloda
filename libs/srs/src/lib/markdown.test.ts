// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { markdownToHtml } from "./markdown";

describe("markdownToHtml", () => {
  it("keeps links and drops remote images", () => {
    const html = markdownToHtml(
      [
        "[docs](https://docs.example/guide)",
        "![](https://evil.example/card.png?q=secret)",
        '<img src="//evil.example/a.png" srcset="https://evil.example/b.png 2x">',
        '<video poster="https://evil.example/c.png"></video>',
        '<svg><image href="https://evil.example/d.png"></image></svg>',
        "<style>b{background:url(https://evil.example/e.png)}</style>",
        '<p style="background:url(https://evil.example/f.png)">styled</p>',
      ].join("\n"),
    );

    expect(html).toContain("https://docs.example/guide");
    expect(html).not.toContain("evil.example");
    expect(html).not.toContain("<style");
  });

  it("keeps relative images", () => {
    const html = markdownToHtml("![](/cards/front.png)");

    expect(html).toContain('src="/cards/front.png"');
  });

  it("drops data images and keeps their alt text", () => {
    const html = markdownToHtml(
      [
        "![logo](data:image/gif;base64,R0lGODlhAQABAAAAACw=)",
        '<img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" alt="dot">',
      ].join("\n"),
    );

    expect(html).not.toContain("data:");
    expect(html).toContain('alt="logo"');
    expect(html).toContain('alt="dot"');
  });
});

describe("markdownToHtml attachment refs", () => {
  const id = "0123456789abcdef".repeat(4);

  it("renders a ref as an image with its attachment id, its alt text, and no src", () => {
    const template = document.createElement("template");
    template.innerHTML = markdownToHtml(`![a "b" <c>](attachment:${id})`);
    const img = template.content.querySelector("img");

    expect(img?.dataset.attachmentId).toBe(id);
    expect(img?.alt).toBe('a "b" <c>');
    expect(img?.hasAttribute("src")).toBe(false);
  });

  it.each([
    ["63 hex characters", `attachment:${id.slice(1)}`],
    ["uppercase hex", `attachment:${id.toUpperCase()}`],
  ])("leaves a malformed ref (%s) as a plain image without a source", (_, href) => {
    const html = markdownToHtml(`![label](${href})`);

    expect(html).not.toContain("data-attachment-id");
    expect(html).not.toContain("attachment:");
    expect(html).toContain('alt="label"');
  });
});
