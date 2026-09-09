import SQLiteESMFactory from "wa-sqlite/dist/wa-sqlite-async.mjs";
import { IDBBatchAtomicVFS } from "wa-sqlite/src/examples/IDBBatchAtomicVFS.js";
import * as SQLite from "wa-sqlite";

// INVARIANT: IndexedDB database name is `koloda` (same as today's PGlite).
export const IDB_DATABASE_NAME = "koloda";

export type SqlValue = SQLiteCompatibleType;
export type SqlRow = Record<string, SqlValue>;

export type RunResult = {
  lastInsertRowid: number;
  changes: number;
};

export type OpenDbOptions = {
  idbName?: string;
};

export type DB = {
  exec(sql: string): Promise<void>;
  run(sql: string, params?: unknown[]): Promise<RunResult>;
  all(sql: string, params?: unknown[]): Promise<SqlRow[]>;
  get(sql: string, params?: unknown[]): Promise<SqlRow | undefined>;
  transaction<T>(fn: (tx: DB) => Promise<T>): Promise<T>;
  close(): Promise<void>;
};

type Engine = {
  sqlite3: SQLiteAPI;
};

let wasmBinaryPromise: Promise<Uint8Array> | undefined;
let enginePromise: Promise<Engine> | undefined;
let vfsSeq = 0;
// WHY: wa-sqlite Asyncify forbids overlapping sqlite calls on the same module,
// including Strict Mode double-fetch and parallel React Query.
let sqliteMutex = Promise.resolve();

function withSqliteLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = sqliteMutex.then(fn);
  sqliteMutex = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

async function loadWasmBinary(): Promise<Uint8Array> {
  // WHY: Vitest's `?url` rewrite is a root-relative `/node_modules/...` path that Node fetch
  // cannot load. Read the file in Node; fetch the Vite asset URL in the browser.
  if (typeof document === "undefined") {
    const { readFile } = await import("node:fs/promises");
    const { createRequire } = await import("node:module");
    const require = createRequire(import.meta.url);
    return readFile(require.resolve("wa-sqlite/dist/wa-sqlite-async.wasm"));
  }

  const wasmUrl = (await import("wa-sqlite/dist/wa-sqlite-async.wasm?url")).default;
  const response = await fetch(wasmUrl);
  if (!response.ok) throw new Error(`failed to load wa-sqlite wasm (${response.status})`);
  return new Uint8Array(await response.arrayBuffer());
}

async function getEngine(): Promise<Engine> {
  enginePromise ??= (async () => {
    wasmBinaryPromise ??= loadWasmBinary();
    const module = await SQLiteESMFactory({ wasmBinary: await wasmBinaryPromise });
    // WHY: Asyncify growing WASM mid-xRead invalidates VFS buffers (wa-sqlite#143).
    module._free(module._malloc(4096 * 4096 + 65536));
    const sqlite3 = SQLite.Factory(module);
    return { sqlite3 };
  })();
  return enginePromise;
}

function toSql(value: unknown): SqlValue {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "boolean") return value ? 1 : 0;
  if (value === undefined) return null;
  if (typeof value === "bigint") return value;
  if (typeof value === "object" && value !== null && !(value instanceof Uint8Array) && !Array.isArray(value)) {
    return JSON.stringify(value);
  }
  if (Array.isArray(value) && !value.every((item) => typeof item === "number")) {
    return JSON.stringify(value);
  }
  return value as SqlValue;
}

function bindParams(params?: unknown[]): SqlValue[] | undefined {
  if (params == null) return undefined;
  return params.map(toSql);
}

function toRows(columns: string[], rows: SQLiteCompatibleType[][]): SqlRow[] {
  return rows.map((values) => {
    const row: SqlRow = {};
    for (let i = 0; i < columns.length; i++) {
      row[columns[i]!] = values[i] ?? null;
    }
    return row;
  });
}

async function deleteIdb(idbName: string) {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(idbName);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => resolve();
  });
}

async function wipeIncompatibleIdb(idbName: string) {
  if (typeof indexedDB === "undefined") return;
  if (typeof indexedDB.databases === "function") {
    const listed = await indexedDB.databases();
    if (!listed.some((database) => database.name === idbName)) return;
  }

  const existing = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(idbName);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  const stores = Array.from(existing.objectStoreNames);
  existing.close();

  // WHY: leftover PGlite `koloda` is not migrated. wa-sqlite needs a `blocks` store.
  if (stores.length > 0 && !stores.includes("blocks")) {
    await deleteIdb(idbName);
  }
}

type Conn = {
  handle: number;
  vfs: IDBBatchAtomicVFS;
};

function isRecoverableSqliteError(error: unknown) {
  if (error instanceof TypeError) return true;
  if (error && typeof error === "object" && "code" in error) {
    const primary = Number((error as { code: unknown }).code) & 0xff;
    return primary === SQLite.SQLITE_IOERR || primary === SQLite.SQLITE_CANTOPEN;
  }
  return false;
}

async function openConnection(sqlite3: SQLiteAPI, idbName: string): Promise<Conn> {
  const vfs = new IDBBatchAtomicVFS(idbName);
  // WHY: wa-sqlite refuses a second register of the same VFS name. IndexedDB stays
  // `idbName`; the SQLite VFS name is unique so close+reopen of `koloda` works.
  const vfsName = `${idbName}-vfs-${++vfsSeq}`;
  vfs.name = vfsName;
  // WHY: wa-sqlite's VFS.Base and SQLiteVFS disagree on xRead's pData shape.
  sqlite3.vfs_register(vfs as unknown as SQLiteVFS, true);
  if (!Object.hasOwn(vfs as object, "handleAsync")) {
    throw new Error("wa-sqlite asyncify did not patch VFS.handleAsync");
  }
  const handle = await sqlite3.open_v2("koloda", undefined, vfsName);
  await sqlite3.exec(handle, "PRAGMA foreign_keys = ON");
  return { handle, vfs };
}

async function closeConnection(sqlite3: SQLiteAPI, conn: Conn) {
  try {
    await sqlite3.close(conn.handle);
  } catch {
    // connection already dead after a VFS I/O failure
  }
  try {
    await conn.vfs.close();
  } catch {
    // IDBContext may already be wedged (`#tx` null)
  }
}

function createApi(sqlite3: SQLiteAPI, conn: Conn, idbName: string, locked: boolean): DB {
  const recover = async () => {
    await closeConnection(sqlite3, conn);
    const next = await openConnection(sqlite3, idbName);
    conn.handle = next.handle;
    conn.vfs = next.vfs;
  };

  const runSqlite = async <T>(fn: () => Promise<T>): Promise<T> => {
    try {
      return await fn();
    } catch (error) {
      // WHY: a failed IDB `put` can leave wa-sqlite's IDBContext `#putChain` dead.
      // Drop the connection so the next statement (e.g. assistant retry-save) works.
      if (isRecoverableSqliteError(error)) {
        try {
          await recover();
        } catch {
          // still surface the original I/O failure
        }
      }
      throw error;
    }
  };

  const wrap = <T>(fn: () => Promise<T>) => (locked ? withSqliteLock(() => runSqlite(fn)) : runSqlite(fn));
  const unlocked = locked ? createApi(sqlite3, conn, idbName, false) : undefined;

  let isClosed = false;

  const db: DB = {
    exec(sql) {
      return wrap(async () => {
        await sqlite3.exec(conn.handle, sql);
      });
    },
    run(sql, params) {
      return wrap(async () => {
        await sqlite3.run(conn.handle, sql, bindParams(params));
        const { columns, rows } = await sqlite3.execWithParams(
          conn.handle,
          "SELECT last_insert_rowid() AS id",
          undefined,
        );
        const [{ id }] = toRows(columns, rows);
        return { lastInsertRowid: Number(id), changes: sqlite3.changes(conn.handle) };
      });
    },
    all(sql, params) {
      return wrap(async () => {
        const { columns, rows } = await sqlite3.execWithParams(conn.handle, sql, bindParams(params));
        return toRows(columns, rows);
      });
    },
    get(sql, params) {
      return wrap(async () => {
        const { columns, rows } = await sqlite3.execWithParams(conn.handle, sql, bindParams(params));
        return toRows(columns, rows)[0];
      });
    },
    transaction(fn) {
      return wrap(async () => {
        const tx = unlocked ?? db;
        if (sqlite3.get_autocommit(conn.handle) === 0) return fn(tx);
        await sqlite3.exec(conn.handle, "BEGIN IMMEDIATE");
        try {
          const result = await fn(tx);
          await sqlite3.exec(conn.handle, "COMMIT");
          return result;
        } catch (error) {
          if (sqlite3.get_autocommit(conn.handle) === 0) {
            await sqlite3.exec(conn.handle, "ROLLBACK");
          }
          throw error;
        }
      });
    },
    close() {
      return wrap(async () => {
        if (isClosed) return;
        isClosed = true;
        await closeConnection(sqlite3, conn);
      });
    },
  };

  return db;
}

export async function openDb(options: OpenDbOptions = {}): Promise<DB> {
  const idbName = options.idbName ?? IDB_DATABASE_NAME;
  await wipeIncompatibleIdb(idbName);
  const { sqlite3 } = await getEngine();

  return withSqliteLock(async () => {
    const conn = await openConnection(sqlite3, idbName);
    return createApi(sqlite3, conn, idbName, true);
  });
}
