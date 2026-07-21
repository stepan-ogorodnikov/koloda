import type { Key } from "@react-types/shared";
import type { RefObject } from "react";
import { describe, expect, it } from "vitest";
import { createSelectKeyboardDelegate, isIterableEmpty } from "./select-behavior";
import type { SelectState } from "./select-behavior";

describe("isIterableEmpty", () => {
  it("treats missing and empty iterables as empty", () => {
    expect(isIterableEmpty(undefined)).toBe(true);
    expect(isIterableEmpty([])).toBe(true);
  });

  it("returns false when the iterable yields at least one item", () => {
    expect(isIterableEmpty(["a"])).toBe(false);
    expect(isIterableEmpty(new Set([1]))).toBe(false);
  });
});

describe("createSelectKeyboardDelegate", () => {
  function createState(keys: Key[]): SelectState {
    const collection = {
      getKeyBefore(key: Key) {
        const index = keys.indexOf(key);
        return index > 0 ? keys[index - 1]! : null;
      },
      getKeyAfter(key: Key) {
        const index = keys.indexOf(key);
        return index >= 0 && index < keys.length - 1 ? keys[index + 1]! : null;
      },
      getFirstKey() {
        return keys[0] ?? null;
      },
      getLastKey() {
        return keys[keys.length - 1] ?? null;
      },
    };

    return { collection } as SelectState;
  }

  it("navigates above, below, first, and last keys", () => {
    const stateRef: RefObject<SelectState> = { current: createState(["a", "b", "c"]) };
    const delegate = createSelectKeyboardDelegate(stateRef);

    expect(delegate.getFirstKey?.()).toBe("a");
    expect(delegate.getLastKey?.()).toBe("c");
    expect(delegate.getKeyAbove?.("b")).toBe("a");
    expect(delegate.getKeyBelow?.("b")).toBe("c");
    expect(delegate.getKeyAbove?.("a")).toBeNull();
    expect(delegate.getKeyBelow?.("c")).toBeNull();
  });

  it("returns null when select state is missing", () => {
    const stateRef: RefObject<SelectState> = { current: null };
    const delegate = createSelectKeyboardDelegate(stateRef);

    expect(delegate.getFirstKey?.()).toBeNull();
    expect(delegate.getLastKey?.()).toBeNull();
    expect(delegate.getKeyAbove?.("a")).toBeNull();
    expect(delegate.getKeyBelow?.("a")).toBeNull();
  });
});
