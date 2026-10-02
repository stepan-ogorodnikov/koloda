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
