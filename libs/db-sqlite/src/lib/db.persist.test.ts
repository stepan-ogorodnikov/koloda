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
});
