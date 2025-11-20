import type { ZodError } from "zod";

// types

export type Modify<T, R> = Omit<T, keyof R> & R;

export type ZodIssue = ZodError["issues"][number];

export type UpdateData<Entity, Id extends keyof Entity, Values> = Pick<Entity, Id> & { values: Values };

// numbers

export function maxNumber(a: number, b: number): number {
  return a > b ? a : b;
}

export function minNumber(a: number, b: number): number {
  return a < b ? a : b;
}

export function getNextNumericId<T extends { id: number }>(items: T[] = []): number {
  if (items.length === 0) return 1;
  const maxId = items.reduce((max, { id }) => (id > max ? id : max), -Infinity);
  return Math.max(maxId + 1, 1);
}

// objects

export type ObjectPropertiesMapping<K, V> = Partial<Record<keyof K, keyof V>>;

export function mapObjectProperties(object: object, map: Record<string, string>) {
  return Object.fromEntries(
    Object.entries(object).map(([k, v]) => [map[k] ?? k, v]),
  );
}

export function mapObjectPropertiesReverse(object: object, map: Record<string, string>) {
  const reverseMap = Object.fromEntries(
    Object.entries(map).map(([k, v]) => [v, k]),
  );
  return mapObjectProperties(object, reverseMap);
}
