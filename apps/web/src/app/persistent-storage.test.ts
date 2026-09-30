import { describe, expect, it, vi } from "vitest";
import { requestPersistentStorage } from "./persistent-storage";

function gestureTarget() {
  const listeners = new Map<string, () => void>();
  return {
    addEventListener(type: string, listener: () => void) {
      listeners.set(type, listener);
    },
    removeEventListener(type: string, listener: () => void) {
      if (listeners.get(type) === listener) listeners.delete(type);
    },
    fire(type: string) {
      listeners.get(type)?.();
    },
    has(type: string) {
      return listeners.has(type);
    },
  };
}

describe("requestPersistentStorage", () => {
  it("asks immediately and once more on the first gesture", () => {
    const persist = vi.fn(() => Promise.resolve(true));
    const target = gestureTarget();

    requestPersistentStorage({ persist }, target);

    expect(persist).toHaveBeenCalledTimes(1);
    target.fire("pointerdown");
    expect(persist).toHaveBeenCalledTimes(2);
    expect(target.has("pointerdown")).toBe(false);
    expect(target.has("keydown")).toBe(false);

    target.fire("keydown");
    expect(persist).toHaveBeenCalledTimes(2);
  });

  it("does nothing when persistent storage is unavailable", () => {
    expect(() => requestPersistentStorage(undefined, gestureTarget())).not.toThrow();
    expect(() => requestPersistentStorage({}, gestureTarget())).not.toThrow();
  });

  it("ignores a refused or thrown grant", async () => {
    const refused = vi.fn(() => Promise.reject(new Error("denied")));
    const thrown = vi.fn(() => {
      throw new Error("denied");
    });

    expect(() => requestPersistentStorage({ persist: refused }, gestureTarget())).not.toThrow();
    expect(() => requestPersistentStorage({ persist: thrown }, gestureTarget())).not.toThrow();
    await Promise.resolve();
    expect(refused).toHaveBeenCalled();
  });
});
