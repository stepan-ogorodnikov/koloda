import { describe, expect, it } from "vitest";
import { ATTACHMENT_MAX_BYTES, addAttachmentSchema, sniffImageMime } from "./attachments";

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

const ascii = (text: string) => [...text].map((char) => char.charCodeAt(0));

function ftyp(major: string, compatible: string[]) {
  const size = 16 + 4 * compatible.length;
  return [0, 0, 0, size, ...ascii("ftyp"), ...ascii(major), 0, 0, 0, 0, ...compatible.flatMap(ascii)];
}

function pngOfLength(length: number) {
  const bytes = new Uint8Array(length);
  bytes.set(PNG_SIGNATURE);
  return bytes;
}

const truncatedBox = ftyp("avif", []);
truncatedBox[3] = 64;

describe("sniffImageMime", () => {
  it.each([
    ["png", [...PNG_SIGNATURE, 0, 0], "image/png"],
    ["jpeg", [0xff, 0xd8, 0xff, 0xe0], "image/jpeg"],
    ["gif87a", [...ascii("GIF87a"), 1, 0], "image/gif"],
    ["gif89a", [...ascii("GIF89a"), 1, 0], "image/gif"],
    ["webp", ascii("RIFF\0\0\0\0WEBPVP8 "), "image/webp"],
    ["avif major brand", ftyp("avif", ["mif1", "miaf"]), "image/avif"],
    ["avis compatible brand", ftyp("mif1", ["miaf", "avis"]), "image/avif"],
    ["heic", ftyp("heic", ["mif1", "heic"]), undefined],
    ["avif brand past the ftyp box", [...ftyp("mif1", ["miaf"]), ...ascii("avif")], undefined],
    ["ftyp box longer than the file", truncatedBox, undefined],
    ["riff wave", ascii("RIFF\0\0\0\0WAVEfmt "), undefined],
    ["svg", ascii('<svg xmlns="http://www.w3.org/2000/svg"/>'), undefined],
    ["png signature cut short", PNG_SIGNATURE.slice(0, 7), undefined],
    ["empty", [], undefined],
  ])("%s", (_, bytes, expected) => {
    expect(sniffImageMime(new Uint8Array(bytes))).toBe(expected);
  });
});

describe("addAttachmentSchema", () => {
  it("accepts an image at the size cap and rejects one byte past it", () => {
    expect(addAttachmentSchema.safeParse({ bytes: pngOfLength(ATTACHMENT_MAX_BYTES) }).success).toBe(true);

    const result = addAttachmentSchema.safeParse({ bytes: pngOfLength(ATTACHMENT_MAX_BYTES + 1) });
    expect(result.error?.issues.map((issue) => issue.message)).toEqual(["validation.attachments.too-large"]);
  });

  it("rejects an unknown format with the format code", () => {
    const result = addAttachmentSchema.safeParse({ bytes: new Uint8Array(ascii("<svg/>")) });
    expect(result.error?.issues.map((issue) => issue.message)).toEqual(["validation.attachments.format"]);
  });
});
