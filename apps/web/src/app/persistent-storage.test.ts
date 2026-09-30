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
  it("does not ask when storage is already persisted", async () => {
    const persist = vi.fn(() => Promise.resolve(true));
    const target = gestureTarget();

    await requestPersistentStorage({ persist, persisted: () => Promise.resolve(true) }, target);

    expect(persist).not.toHaveBeenCalled();
    expect(target.has("pointerdown")).toBe(false);
    expect(target.has("keydown")).toBe(false);
  });

  it("stops after a granted first ask", async () => {
    const persist = vi.fn(() => Promise.resolve(true));
    const target = gestureTarget();

    await requestPersistentStorage({ persist, persisted: () => Promise.resolve(false) }, target);

    expect(persist).toHaveBeenCalledTimes(1);
    expect(target.has("pointerdown")).toBe(false);
    expect(target.has("keydown")).toBe(false);
  });

  it("asks once more on the first gesture after a refusal", async () => {
    const persist = vi.fn(() => Promise.resolve(false));
    const target = gestureTarget();

    await requestPersistentStorage({ persist, persisted: () => Promise.resolve(false) }, target);

    expect(persist).toHaveBeenCalledTimes(1);
    target.fire("pointerdown");
    expect(persist).toHaveBeenCalledTimes(2);
    expect(target.has("pointerdown")).toBe(false);
    expect(target.has("keydown")).toBe(false);

    target.fire("keydown");
    expect(persist).toHaveBeenCalledTimes(2);
  });

  it("does nothing when persistent storage is unavailable", async () => {
    await expect(requestPersistentStorage(undefined, gestureTarget())).resolves.toBeUndefined();
    await expect(requestPersistentStorage({}, gestureTarget())).resolves.toBeUndefined();
  });

  it("treats a rejected or thrown call as not granted", async () => {
    const rejected = gestureTarget();
    const thrown = gestureTarget();

    await requestPersistentStorage(
      { persist: () => Promise.reject(new Error("denied")), persisted: () => Promise.reject(new Error("denied")) },
      rejected,
    );
    await requestPersistentStorage(
      {
        persist: () => {
          throw new Error("denied");
        },
        persisted: () => {
          throw new Error("denied");
        },
      },
      thrown,
    );

    expect(rejected.has("pointerdown")).toBe(true);
    expect(thrown.has("pointerdown")).toBe(true);
  });
});
