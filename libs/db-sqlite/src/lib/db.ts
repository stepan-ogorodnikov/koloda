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

export type DB = {
  exec(sql: string): Promise<void>;
  run(sql: string, params?: SqlValue[]): Promise<RunResult>;
  all(sql: string, params?: SqlValue[]): Promise<SqlRow[]>;
  get(sql: string, params?: SqlValue[]): Promise<SqlRow | undefined>;
  close(): Promise<void>;
};

type Engine = {
  sqlite3: SQLiteAPI;
  // WHY: SQLite keeps only a C pointer to the VFS; drop this and GC can collect it.
  vfs: IDBBatchAtomicVFS;
};

let wasmBinaryPromise: Promise<Uint8Array> | undefined;
let enginePromise: Promise<Engine> | undefined;

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
    const sqlite3 = SQLite.Factory(module);
    const vfs = new IDBBatchAtomicVFS(IDB_DATABASE_NAME);
    // WHY: wa-sqlite's VFS.Base and SQLiteVFS disagree on xRead's pData shape.
    sqlite3.vfs_register(vfs as unknown as SQLiteVFS, true);
    return { sqlite3, vfs };
  })();
  return enginePromise;
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

export async function openDb(): Promise<DB> {
  const { sqlite3 } = await getEngine();
  const handle = await sqlite3.open_v2("koloda", undefined, IDB_DATABASE_NAME);
  await sqlite3.exec(handle, "PRAGMA foreign_keys = ON");

  let isClosed = false;

  const db: DB = {
    async exec(sql) {
      await sqlite3.exec(handle, sql);
    },
    async run(sql, params) {
      await sqlite3.run(handle, sql, params);
      const [{ id }] = await db.all("SELECT last_insert_rowid() AS id");
      return { lastInsertRowid: Number(id), changes: sqlite3.changes(handle) };
    },
    async all(sql, params) {
      const { columns, rows } = await sqlite3.execWithParams(handle, sql, params);
      return toRows(columns, rows);
    },
    async get(sql, params) {
      const rows = await db.all(sql, params);
      return rows[0];
    },
    async close() {
      if (isClosed) return;
      isClosed = true;
      await sqlite3.close(handle);
    },
  };

  return db;
}
