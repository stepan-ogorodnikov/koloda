import { describe, expect, it } from "vitest";
import { base64ToBytes, bytesToBase64 } from "./base64";

// WHY: the attachment size cap; the @koloda/srs barrel pulls Lingui macros this runner cannot load.
const ATTACHMENT_MAX_BYTES = 5_242_880;

describe("base64 codec", () => {
  it("round-trips a cap-sized payload with every byte value", () => {
    const bytes = new Uint8Array(ATTACHMENT_MAX_BYTES);
    for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 7) % 256;

    const decoded = base64ToBytes(bytesToBase64(bytes));

    // WHY: toEqual walks 5 MiB element by element (seconds); Buffer.compare is a memcmp.
    expect(Buffer.compare(decoded, bytes)).toBe(0);
  });

  it("matches the standard alphabet with padding", () => {
    expect(bytesToBase64(new Uint8Array([0xfb, 0xff, 0x01]))).toBe("+/8B");
    expect(bytesToBase64(new Uint8Array([0x66, 0x6f]))).toBe("Zm8=");
  });
});
