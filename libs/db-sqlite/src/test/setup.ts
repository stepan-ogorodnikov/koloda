import "fake-indexeddb/auto";

type LockCallback = (lock: { name: string; mode: string } | null) => unknown;

type LockRequestOptions = {
  mode?: string;
  ifAvailable?: boolean;
  signal?: AbortSignal;
};

const tails = new Map<string, Promise<void>>();

function requestLock(
  name: string,
  optionsOrCallback: LockRequestOptions | LockCallback,
  maybeCallback?: LockCallback,
): Promise<unknown> {
  const options = typeof optionsOrCallback === "function" ? {} : optionsOrCallback;
  const callback = typeof optionsOrCallback === "function" ? optionsOrCallback : maybeCallback;
  if (!callback) throw new Error("Web Locks polyfill: callback required");

  const previous = tails.get(name);
  if (options.ifAvailable && previous) return Promise.resolve(callback(null));

  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const start = previous ?? Promise.resolve();
  const next = start.then(() => held);
  tails.set(name, next);

  return start.then(async () => {
    try {
      return await callback({ name, mode: options.mode ?? "exclusive" });
    } finally {
      release();
      if (tails.get(name) === next) tails.delete(name);
    }
  });
}

function installWebLocks() {
  const locks = {
    request: requestLock,
    query: async () => ({
      held: [] as { name: string; mode: string }[],
      pending: [] as { name: string; mode: string }[],
    }),
  };

  const navigator = globalThis.navigator as Navigator | undefined;
  if (navigator && "locks" in navigator && navigator.locks?.request) return;

  if (navigator) {
    Object.defineProperty(navigator, "locks", { configurable: true, value: locks });
    return;
  }

  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { locks },
  });
}

installWebLocks();

if (typeof globalThis.self === "undefined") {
  Object.defineProperty(globalThis, "self", { configurable: true, value: globalThis });
}

// WHY: fake-indexeddb wraps a non-Array store name as `[storeNames]`. wa-sqlite
// passes `db.objectStoreNames` (a DOMStringList), which then looks up "[object Object]".
const originalTransaction = IDBDatabase.prototype.transaction;
IDBDatabase.prototype.transaction = function (storeNames, mode, options) {
  const names =
    storeNames != null && typeof storeNames === "object" && !Array.isArray(storeNames) && "length" in storeNames
      ? Array.from(storeNames as ArrayLike<string>)
      : storeNames;
  return originalTransaction.call(this, names, mode, options);
};
