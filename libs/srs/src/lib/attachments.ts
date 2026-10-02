import { z } from "zod";

export const ATTACHMENT_MAX_BYTES = 5_242_880;

export const ATTACHMENT_MIMES = ["image/png", "image/jpeg", "image/gif", "image/webp", "image/avif"] as const;

export type AttachmentMime = (typeof ATTACHMENT_MIMES)[number];

// INVARIANT: the id is the lowercase hex SHA-256 of the bytes; nothing else is a ref.
export const ATTACHMENT_REF_PATTERN = /^attachment:([0-9a-f]{64})$/;

export const attachmentRowSchema = z.object({
  id: z.string().regex(/^[0-9a-f]{64}$/),
  mime: z.enum(ATTACHMENT_MIMES),
  size: z.int().nonnegative(),
  width: z.int().positive().nullable(),
  height: z.int().positive().nullable(),
  createdAt: z.date(),
});

export type Attachment = z.infer<typeof attachmentRowSchema>;

export const addAttachmentSchema = z.object({
  // WHY: Web Crypto and Blob take only ArrayBuffer-backed views, not shared memory.
  bytes: z
    .custom<Uint8Array<ArrayBuffer>>((value) => value instanceof Uint8Array && value.buffer instanceof ArrayBuffer)
    .superRefine((bytes, ctx) => {
      const code = getAttachmentBytesError(bytes);
      if (code) ctx.addIssue({ code: "custom", message: code });
    }),
  width: z.int().positive().optional(),
  height: z.int().positive().optional(),
});

export type AddAttachmentData = z.infer<typeof addAttachmentSchema>;

export function getAttachmentBytesError(bytes: Uint8Array) {
  if (bytes.byteLength > ATTACHMENT_MAX_BYTES) return "validation.attachments.too-large";
  if (!sniffImageMime(bytes)) return "validation.attachments.format";
  return undefined;
}

export function sniffImageMime(bytes: Uint8Array): AttachmentMime | undefined {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (isAscii(bytes, 0, "GIF87a") || isAscii(bytes, 0, "GIF89a")) return "image/gif";
  if (isAscii(bytes, 0, "RIFF") && isAscii(bytes, 8, "WEBP")) return "image/webp";
  if (isAvif(bytes)) return "image/avif";
  return undefined;
}

// WHY: AVIF shares the ISO-BMFF `ftyp` box with HEIC and other formats; only an
// `avif` or `avis` brand (major or compatible) marks it as AVIF.
function isAvif(bytes: Uint8Array) {
  if (bytes.byteLength < 16 || !isAscii(bytes, 4, "ftyp")) return false;
  const size = new DataView(bytes.buffer, bytes.byteOffset, 4).getUint32(0);
  if (size < 16 || size > bytes.byteLength) return false;
  const isAvifBrand = (offset: number) => isAscii(bytes, offset, "avif") || isAscii(bytes, offset, "avis");
  if (isAvifBrand(8)) return true;
  for (let offset = 16; offset + 4 <= size; offset += 4) {
    if (isAvifBrand(offset)) return true;
  }
  return false;
}

function startsWith(bytes: Uint8Array, prefix: number[]) {
  return bytes.byteLength >= prefix.length && prefix.every((byte, i) => bytes[i] === byte);
}

function isAscii(bytes: Uint8Array, offset: number, text: string) {
  if (bytes.byteLength < offset + text.length) return false;
  for (let i = 0; i < text.length; i++) {
    if (bytes[offset + i] !== text.charCodeAt(i)) return false;
  }
  return true;
}
