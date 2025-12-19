import type { ZodError } from "zod";

/**
 * @section Types
 */

export type DeepPartial<T> = T extends string | number | bigint | boolean | null | undefined | symbol | Date
  ? T | undefined
  : T extends Array<infer ArrayType> ? Array<DeepPartial<ArrayType>>
  : T extends ReadonlyArray<infer ArrayType> ? ReadonlyArray<ArrayType>
  : T extends Set<infer SetType> ? Set<DeepPartial<SetType>>
  : T extends ReadonlySet<infer SetType> ? ReadonlySet<SetType>
  : T extends Map<infer KeyType, infer ValueType> ? Map<DeepPartial<KeyType>, DeepPartial<ValueType>>
  : T extends ReadonlyMap<infer KeyType, infer ValueType> ? ReadonlyMap<DeepPartial<KeyType>, DeepPartial<ValueType>>
  : {
    [K in keyof T]?: DeepPartial<T[K]>;
  };

export type Modify<T, R> = Omit<T, keyof R> & R;

export type ZodIssue = ZodError["issues"][number];

export type UpdateData<Entity, Id extends keyof Entity, Values> = Pick<Entity, Id> & { values: Values };

/**
 * @section Numbers
 */

/**
 * Returns the larger of two numbers
 * @param a - First number
 * @param b - Second number
 * @returns The larger of the two numbers
 */
export function maxNumber(a: number, b: number): number {
  return a > b ? a : b;
}

/**
 * Returns the smaller of two numbers
 * @param a - First number
 * @param b - Second number
 * @returns The smaller of the two numbers
 */
export function minNumber(a: number, b: number): number {
  return a < b ? a : b;
}

/**
 * Gets the next available numeric ID for an array of items with IDs
 * @param items - Array of objects with numeric ID
 * @returns The next available ID (max ID + 1, minimum of 1)
 */
export function getNextNumericId<T extends { id: number }>(items: T[] = []): number {
  if (items.length === 0) return 1;
  const maxId = items.reduce((max, { id }) => (id > max ? id : max), -Infinity);
  return Math.max(maxId + 1, 1);
}

/**
 * @section Objects
 */

export type ObjectPropertiesMapping<K, V> = Partial<Record<keyof K, keyof V>>;

/**
 * Renames properties for given object from map's key -> value
 * @param object - The object to map properties for
 * @param map - An object that maps original keys to new keys
 * @returns A new object with mapped properties
 * @example
 * ```ts
 * const original = { firstName: "John", lastName: "Doe", age: 18 };
 * const mapping = { firstName: "first_name", lastName: "last_name" };
 * const result = mapObjectProperties(original, mapping);
 * // result: { first_name: "John", last_name: "Doe", age: 18 }
 * ```
 */
export function mapObjectProperties(object: object, map: Record<string, string>) {
  return Object.fromEntries(
    Object.entries(object).map(([k, v]) => [map[k] ?? k, v]),
  );
}

/**
 * Renames properties for given object from map's value -> key
 * @param object - The object to rename properties for
 * @param map - An object that maps original keys to new keys (reverse order)
 * @returns A new object with properties mapped in reverse
 * @example
 * ```ts
 * const original = { first_name: "John", last_name: "Doe", age: 18 };
 * const mapping = { firstName: "first_name", lastName: "last_name" };
 * const result = mapObjectPropertiesReverse(original, mapping);
 * // result: { firstName: "John", lastName: "Doe", age: 18 }
 * ```
 */
export function mapObjectPropertiesReverse(object: object, map: Record<string, string>) {
  const reverseMap = Object.fromEntries(
    Object.entries(map).map(([k, v]) => [v, k]),
  );
  return mapObjectProperties(object, reverseMap);
}
