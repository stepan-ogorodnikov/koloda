export type DeepPartial<T> = T extends string | number | bigint | boolean | null | undefined | symbol | Date
  ? T | undefined
  : T extends Array<infer ArrayType>
    ? Array<DeepPartial<ArrayType>>
    : T extends ReadonlyArray<infer ArrayType>
      ? ReadonlyArray<ArrayType>
      : T extends Set<infer SetType>
        ? Set<DeepPartial<SetType>>
        : T extends ReadonlySet<infer SetType>
          ? ReadonlySet<SetType>
          : T extends Map<infer KeyType, infer ValueType>
            ? Map<DeepPartial<KeyType>, DeepPartial<ValueType>>
            : T extends ReadonlyMap<infer KeyType, infer ValueType>
              ? ReadonlyMap<DeepPartial<KeyType>, DeepPartial<ValueType>>
              : {
                  [K in keyof T]?: DeepPartial<T[K]>;
                };

export type Modify<T, R> = Omit<T, keyof R> & R;

export type UpdateData<Entity, Id extends keyof Entity, Values> = Pick<Entity, Id> & { values: Values };

export function getNextNumericId<T extends { id: number }>(items: T[] = []): number {
  if (items.length === 0) return 1;
  const maxId = items.reduce((max, { id }) => (id > max ? id : max), -Infinity);
  return Math.max(maxId + 1, 1);
}

export function deepMerge<T extends Record<string, unknown>>(target: T, partial: DeepPartial<T>): T {
  if (typeof partial !== "object" || partial === null) return target;
  const output = { ...target };

  for (const key in partial) {
    if (Object.prototype.hasOwnProperty.call(partial, key)) {
      const sourceValue = partial[key];
      const targetValue = output[key];
      if (sourceValue === undefined) continue;

      if (Array.isArray(sourceValue) && Array.isArray(targetValue)) {
        (output as any)[key] = sourceValue.map((value, index) => {
          if (typeof value === "object" && value !== null && !isSpecialObject(value)) {
            const targetItem = targetValue[index];
            if (typeof targetItem === "object" && targetItem !== null && !Array.isArray(targetItem)) {
              return deepMerge(targetItem, value);
            }
          }
          return value;
        });
        continue;
      }

      if (
        typeof sourceValue === "object" &&
        sourceValue !== null &&
        !Array.isArray(sourceValue) &&
        typeof targetValue === "object" &&
        targetValue !== null &&
        !Array.isArray(targetValue) &&
        !isSpecialObject(sourceValue) &&
        !isSpecialObject(targetValue)
      ) {
        (output as any)[key] = deepMerge(
          targetValue as Record<string, unknown>,
          sourceValue as DeepPartial<Record<string, unknown>>,
        );
        continue;
      }

      (output as any)[key] = sourceValue;
    }
  }

  return output;
}

function isSpecialObject(obj: unknown): boolean {
  return obj instanceof Date || obj instanceof Set || obj instanceof Map;
}

export type Entries<T> = { [K in keyof T]: [K, T[K]] }[keyof T];

export function getObjectProperty(obj: object, key: string): unknown {
  return key in obj ? (obj as Record<string, unknown>)[key] : undefined;
}

export function objectEntries<T extends object>(object: T): Entries<T>[] {
  return Object.entries(object) as any;
}

export type ObjectPropertiesMapping<K, V> = Partial<Record<keyof K, keyof V>>;

export function mapObjectProperties(object: object, map: Record<string, string>) {
  return Object.fromEntries(Object.entries(object).map(([k, v]) => [map[k] ?? k, v]));
}

export function mapObjectPropertiesReverse(object: object, map: Record<string, string>) {
  const reverseMap = Object.fromEntries(Object.entries(map).map(([k, v]) => [v, k]));
  return mapObjectProperties(object, reverseMap);
}

// WHY: `crypto.randomUUID` is unavailable on Electron `file://` origins; Math.random fallback is intentional.
export function generateUUID(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
