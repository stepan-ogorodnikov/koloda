/**
 * Electron NAPI wire format.
 *
 * NAPI value marshalling doesn't align naturally with serde — JS `Date` is
 * an object, not a number. Use {@link toWire} to coerce domain values into
 * a JSON-safe shape before crossing the boundary, and {@link fromWire} to
 * rehydrate timestamps from the Rust side.
 */

/**
 * Subset of JSON accepted as an IPC payload.
 */
export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

/**
 * Thrown by {@link toWire} when a value cannot be losslessly serialized
 * (functions, symbols, circular references, unsafe BigInts, invalid Dates).
 */
export class WireError extends Error {
  override readonly name = "WireError";
  constructor(message: string, public readonly path: string) {
    super(`${message} at ${path || "<root>"}`);
  }
}

/**
 * Coerces a domain value into a JSON-safe shape suitable for IPC.
 *
 * - `Date` -> epoch ms (number)
 * - `BigInt` -> number (throws if outside the safe integer range)
 * - `undefined` -> dropped from objects; `null` stays `null`
 * - cycles, functions, symbols -> throws {@link WireError}
 */
export function toWire(value: unknown): JsonValue {
  return walkWire(value, new WeakSet(), "");
}

function walkWire(value: unknown, seen: WeakSet<object>, path: string): JsonValue {
  if (value === null) return null;
  if (value === undefined) return null;
  if (value instanceof Date) {
    const ms = value.getTime();
    if (Number.isNaN(ms)) throw new WireError("Invalid Date", path);
    return ms;
  }
  const t = typeof value;
  if (t === "string" || t === "number" || t === "boolean") return value as JsonValue;
  if (t === "bigint") {
    const big = value as bigint;
    if (big > BigInt(Number.MAX_SAFE_INTEGER) || big < BigInt(Number.MIN_SAFE_INTEGER)) {
      throw new WireError(`BigInt out of safe integer range: ${big}`, path);
    }
    return Number(big);
  }
  if (t === "function" || t === "symbol") {
    throw new WireError(`Cannot serialize ${t}`, path);
  }
  if (Array.isArray(value)) {
    if (seen.has(value)) throw new WireError("Circular reference", path);
    seen.add(value);
    const out: JsonValue[] = Array.from({ length: value.length });
    for (let i = 0; i < value.length; i++) {
      out[i] = walkWire(value[i], seen, path ? `${path}[${i}]` : `[${i}]`);
    }
    seen.delete(value);
    return out;
  }
  if (t === "object") {
    const obj = value as Record<string, unknown>;
    if (seen.has(obj)) throw new WireError("Circular reference", path);
    seen.add(obj);
    const out: { [key: string]: JsonValue } = {};
    for (const k of Object.keys(obj)) {
      const childPath = path ? `${path}.${k}` : k;
      const v = obj[k];
      if (v === undefined) continue;
      out[k] = walkWire(v, seen, childPath);
    }
    seen.delete(obj);
    return out;
  }
  throw new WireError(`Cannot serialize ${t}`, path);
}

export type WireReviver = (key: string, value: unknown) => unknown;

const defaultWireReviver: WireReviver = (_key, value) => reviveDates(value);

/**
 * Recursively rehydrates a JSON-decoded value, applying the supplied reviver
 * at every node. Use to turn wire responses back into domain values.
 */
export function fromWire<T = unknown>(value: unknown, reviver: WireReviver = defaultWireReviver): T {
  return revive(value, "", reviver) as T;
}

function revive(value: unknown, path: string, reviver: WireReviver): unknown {
  const r = reviver(path, value);
  if (r === null || r === undefined) return r;
  if (typeof r === "string" || typeof r === "number" || typeof r === "boolean") return r;
  if (r instanceof Date) return r;
  if (Array.isArray(r)) {
    const out = Array.from({ length: r.length });
    for (let i = 0; i < r.length; i++) {
      out[i] = revive(r[i], path ? `${path}[${i}]` : `[${i}]`, reviver);
    }
    return out;
  }
  if (typeof r === "object") {
    const obj = r as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(obj)) {
      out[k] = revive(obj[k], path ? `${path}.${k}` : k, reviver);
    }
    return out;
  }
  return r;
}

function reviveDates(value: unknown): unknown {
  if (typeof value !== "string") return value;
  if (value.length < 10) return value;
  if (value[4] !== "-" || value[7] !== "-") return value;
  if (value[10] !== "T" && value[10] !== " " && value.length !== 10) return value;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? value : new Date(ms);
}
