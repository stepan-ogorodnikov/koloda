import { describe, expect, it } from "vitest";
import {
  altFromFileName,
  altFromUrl,
  getPastedHttpUrl,
  insertAtSelection,
  swapPastedUrl,
  toAttachmentImageMarkdown,
} from "./image-insertion";

describe("insertAtSelection", () => {
  it.each([
    ["at the start", 0, 0, { value: "XYabc", cursor: 2 }],
    ["in the middle", 1, 1, { value: "aXYbc", cursor: 3 }],
    ["at the end", 3, 3, { value: "abcXY", cursor: 5 }],
    ["over a selection", 1, 3, { value: "aXY", cursor: 3 }],
    ["over a backward selection", 3, 1, { value: "aXY", cursor: 3 }],
  ])("inserts %s and puts the cursor after the insertion", (_, start, end, expected) => {
    expect(insertAtSelection("abc", start, end, "XY")).toEqual(expected);
  });
});

describe("image markdown alt text", () => {
  it("escapes brackets and backslashes so the alt cannot close the image early", () => {
    expect(toAttachmentImageMarkdown("a]b[c\\d", "f".repeat(64))).toBe(
      `![a\\]b\\[c\\\\d](attachment:${"f".repeat(64)})`,
    );
  });

  it.each([
    ["cat.png", "cat"],
    ["my.cat.photo.webp", "my.cat.photo"],
    ["README", "README"],
    [".hidden", ".hidden"],
  ])("derives the alt for %s from the name without its extension", (name, alt) => {
    expect(altFromFileName(name)).toBe(alt);
  });
});

describe("pasted image URLs", () => {
  it.each([
    ["https://example.test/cat.png", "https://example.test/cat.png"],
    [" http://example.test/a?b=c \n", "http://example.test/a?b=c"],
    ["https://example.test/a https://example.test/b", null],
    ["see https://example.test/a", null],
    ["ftp://example.test/cat.png", null],
    ["file:///tmp/cat.png", null],
    ["cat.png", null],
  ])("takes %j as an embeddable URL: %j", (text, expected) => {
    expect(getPastedHttpUrl(text)).toBe(expected);
  });

  it.each([
    ["https://example.test/img/cute%20cat.png?size=2", "cute cat"],
    ["https://example.test/img/", "img"],
    ["https://example.test/", ""],
    ["https://example.test/100%.png", "100%"],
  ])("derives the alt for %s from the last path segment", (url, alt) => {
    expect(altFromUrl(url)).toBe(alt);
  });

  it("swaps the pasted URL for the image when it is still in place", () => {
    const url = "https://example.test/cat.png";

    expect(swapPastedUrl(`a ${url} b`, { url, start: 2 }, "IMG")).toEqual({ value: "a IMG b", cursor: 5 });
  });

  it("leaves the text alone when the pasted URL was edited away", () => {
    const url = "https://example.test/cat.png";

    expect(swapPastedUrl(`a ${url.slice(0, -1)}x b`, { url, start: 2 }, "IMG")).toBeNull();
    expect(swapPastedUrl(`ab ${url}`, { url, start: 2 }, "IMG")).toBeNull();
  });
});
