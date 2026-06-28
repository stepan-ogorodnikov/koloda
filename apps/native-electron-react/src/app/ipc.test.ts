import { describe, expect, it } from "vitest";
import { fromWire, toWire, WireError } from "./ipc";

describe("ipc wire", () => {
  it("serializes dates to epoch ms for IPC", () => {
    const ms = 1_700_000_001_000;
    expect(toWire({ updatedAt: new Date(ms) })).toEqual({ updatedAt: ms });
  });

  it("rehydrates ISO date strings from IPC responses", () => {
    const iso = "2023-11-14T22:13:21.000Z";
    const result = fromWire<{ updatedAt: Date }>({ updatedAt: iso });
    expect(result.updatedAt).toEqual(new Date(iso));
  });

  it("round-trips conversation timestamps through the wire layer", () => {
    const ms = 1_700_000_001_000;
    const wire = toWire({
      id: "conv-1",
      state: { messages: [] },
      updatedAt: new Date(ms),
    });
    expect(wire).toEqual({
      id: "conv-1",
      state: { messages: [] },
      updatedAt: ms,
    });

    const restored = fromWire<{ updatedAt: Date }>({
      ...(wire as Record<string, unknown>),
      updatedAt: new Date(ms).toISOString(),
    });
    expect(restored.updatedAt.getTime()).toBe(ms);
  });

  it("throws WireError for non-serializable IPC values", () => {
    expect(() => toWire(() => {})).toThrow(WireError);
  });

  it("throws WireError for functions in nested objects", () => {
    expect(() => toWire({ fn() {} })).toThrow(WireError);
  });

  it("throws WireError for circular references", () => {
    const obj: Record<string, unknown> = { a: 1 };
    obj.self = obj;
    expect(() => toWire(obj)).toThrow(WireError);
  });

  it("drops undefined values from objects", () => {
    expect(toWire({ a: 1, b: undefined })).toEqual({ a: 1 });
  });

  it("preserves null values in objects", () => {
    expect(toWire({ a: 1, b: null })).toEqual({ a: 1, b: null });
  });

  it("passes primitives through unchanged", () => {
    expect(toWire("hello")).toBe("hello");
    expect(toWire(42)).toBe(42);
    expect(toWire(true)).toBe(true);
    expect(toWire(null)).toBe(null);
  });

  it("round-trips arrays with dates", () => {
    const dates = [new Date(0), new Date(1_700_000_001_000)];
    const wire = toWire(dates);
    expect(wire).toEqual([0, 1_700_000_001_000]);
  });
});
