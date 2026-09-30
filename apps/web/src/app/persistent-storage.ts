type PersistStorage = {
  persist?: () => Promise<boolean>;
  persisted?: () => Promise<boolean>;
};

type PersistableStorage = PersistStorage & { persist: () => Promise<boolean> };

type GestureTarget = {
  addEventListener: (type: string, listener: () => void) => void;
  removeEventListener: (type: string, listener: () => void) => void;
};

// WHY: IndexedDB is the only copy of web data. persist() asks the browser to keep it.
// Some browsers prompt for it, so skip when the grant already holds.
// A refused first ask retries on the first pointer or key: some browsers grant only during a user gesture.
export async function requestPersistentStorage(
  storage: PersistStorage | undefined = globalThis.navigator?.storage,
  target: GestureTarget | undefined = typeof window === "undefined" ? undefined : window,
): Promise<void> {
  if (!canPersist(storage)) return;
  if (await isPersisted(storage)) return;
  if ((await ask(storage)) || target == null) return;

  const onGesture = () => {
    target.removeEventListener("pointerdown", onGesture);
    target.removeEventListener("keydown", onGesture);
    void ask(storage);
  };
  target.addEventListener("pointerdown", onGesture);
  target.addEventListener("keydown", onGesture);
}

function canPersist(storage: PersistStorage | undefined): storage is PersistableStorage {
  return typeof storage?.persist === "function";
}

async function isPersisted(storage: PersistStorage): Promise<boolean> {
  try {
    return (await storage.persisted?.()) === true;
  } catch {
    // WHY: an unreadable grant state is treated as not granted, so the app still asks.
    return false;
  }
}

async function ask(storage: PersistableStorage): Promise<boolean> {
  try {
    return (await storage.persist()) === true;
  } catch {
    // WHY: a refused or thrown persist() must not take down startup.
    return false;
  }
}
