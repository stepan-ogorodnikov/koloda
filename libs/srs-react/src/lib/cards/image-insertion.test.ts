import { describe, expect, it } from "vitest";
import { altFromFileName, insertAtSelection, toAttachmentImageMarkdown } from "./image-insertion";

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
