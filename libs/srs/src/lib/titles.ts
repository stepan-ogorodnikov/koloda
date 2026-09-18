import { z } from "zod";

export const ENTITY_TITLE_MAX_LENGTH = 255;
export const PROFILE_TITLE_MAX_LENGTH = 128;

/** Twin of Rust `title.trim()` before length checks and persistence. */
export function trimTitleValue(value: string): string {
  return value.trim();
}

const tooShort = "validation.common.title.too-short";
const tooLong = "validation.common.title.too-long";

/** Required deck / algorithm / template titles — trim, then 1–255 UTF-16 units. */
export const requiredEntityTitleSchema = z.preprocess(
  (val) => (typeof val === "string" ? trimTitleValue(val) : val),
  z.string().min(1, tooShort).max(ENTITY_TITLE_MAX_LENGTH, tooLong),
);

/** Optional AI profile title — whitespace-only becomes absent; otherwise trim then max 128 UTF-16 units. */
export const optionalProfileTitleSchema = z.preprocess((val) => {
  if (val === undefined || val === null) return undefined;
  if (typeof val !== "string") return val;
  const trimmed = trimTitleValue(val);
  return trimmed.length === 0 ? undefined : trimmed;
}, z.string().max(PROFILE_TITLE_MAX_LENGTH, tooLong).optional());
