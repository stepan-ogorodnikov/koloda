export const FSRS_NEW = 0;
export const FSRS_LEARNING = 1;
export const FSRS_REVIEW = 2;
export const FSRS_RELEARNING = 3;

export function nowMs() {
  return Date.now();
}

export function toUnixMs(value: Date | string | number) {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return value;
  return new Date(value).getTime();
}

export function placeholders(count: number) {
  return Array.from({ length: count }, () => "?").join(", ");
}
