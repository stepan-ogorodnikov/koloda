import { afterEach, describe, expect, it } from "vitest";
import { IDB_DATABASE_NAME, openDb } from "./db";

async function deleteKolodaIdb() {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(IDB_DATABASE_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => resolve();
  });
}

describe("db-sqlite persist/reload", () => {
  afterEach(async () => {
    await deleteKolodaIdb();
  });

  it("writes a row to IndexedDB koloda and reads it back after close and reopen", async () => {
    const db = await openDb();
    await db.exec("CREATE TABLE scratch (id INTEGER PRIMARY KEY, name TEXT NOT NULL)");
    const inserted = await db.run("INSERT INTO scratch (name) VALUES (?)", ["kept"]);
    expect(inserted.lastInsertRowid).toBe(1);

    const [{ foreign_keys }] = await db.all("PRAGMA foreign_keys");
    expect(foreign_keys).toBe(1);

    await db.close();

    const names = (await indexedDB.databases()).map((database) => database.name);
    expect(names).toContain(IDB_DATABASE_NAME);

    const reopened = await openDb();
    expect(await reopened.get("SELECT name FROM scratch WHERE id = ?", [1])).toEqual({ name: "kept" });
    const [{ foreign_keys: reopenedForeignKeys }] = await reopened.all("PRAGMA foreign_keys");
    expect(reopenedForeignKeys).toBe(1);
    await reopened.close();
  });

  it("skips a purge that wa-sqlite scheduled for after close", async () => {
    const rejections: unknown[] = [];
    const onRejection = (reason: unknown) => rejections.push(reason);
    const scheduled: (() => void)[] = [];
    process.on("unhandledRejection", onRejection);
    // WHY: wa-sqlite schedules its purge on `requestIdleCallback` when there is one, so holding the callback lets
    // the test run it after close. Faking `setTimeout` instead would also stall wa-sqlite's own transaction refresh.
    Object.defineProperty(globalThis, "requestIdleCallback", {
      configurable: true,
      value: (callback: () => void) => scheduled.push(callback),
    });
    try {
      const db = await openDb();
      await db.exec("CREATE TABLE scratch (id INTEGER PRIMARY KEY, body BLOB NOT NULL)");
      await db.exec(
        `WITH RECURSIVE n (i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < 64)
         INSERT INTO scratch (body) SELECT randomblob(4000) FROM n`,
      );
      // WHY: a purge is scheduled once commits have overwritten at least 16 existing pages.
      await db.exec("UPDATE scratch SET body = randomblob(4000)");
      await db.close();
      expect(scheduled).toHaveLength(1);

      for (const callback of scheduled) callback();
      await new Promise((resolve) => setImmediate(resolve));
      await new Promise((resolve) => setImmediate(resolve));
    } finally {
      Reflect.deleteProperty(globalThis, "requestIdleCallback");
      process.off("unhandledRejection", onRejection);
    }

    expect(rejections).toEqual([]);
  });
});
