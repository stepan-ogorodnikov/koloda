type PersistStorage = {
  persist?: () => Promise<boolean>;
};

type GestureTarget = {
  addEventListener: (type: string, listener: () => void) => void;
  removeEventListener: (type: string, listener: () => void) => void;
};

// WHY: IndexedDB is the only copy of web data. persist() asks the browser to keep it.
// The first pointer or key asks again: some browsers grant that only during a user gesture.
export function requestPersistentStorage(
  storage: PersistStorage | undefined = globalThis.navigator?.storage,
  target: GestureTarget | undefined = typeof window === "undefined" ? undefined : window,
): void {
  ask(storage);
  if (target == null || typeof storage?.persist !== "function") return;

  const onGesture = () => {
    ask(storage);
    target.removeEventListener("pointerdown", onGesture);
    target.removeEventListener("keydown", onGesture);
  };
  target.addEventListener("pointerdown", onGesture);
  target.addEventListener("keydown", onGesture);
}

function ask(storage: PersistStorage | undefined) {
  if (typeof storage?.persist !== "function") return;
  try {
    void Promise.resolve(storage.persist()).catch(() => {
      // WHY: a refused grant must not take down startup.
    });
  } catch {
    // WHY: a thrown persist() must not take down startup.
  }
}
