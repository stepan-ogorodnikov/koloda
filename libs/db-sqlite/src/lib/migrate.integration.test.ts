import { describe, expect, it } from "vitest";
import { openDb } from "./db";
import { applyPendingMigrations, getAppliedMigrationNames } from "./migrate";

async function deleteIdb(name: string) {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => resolve();
  });
}

describe("applyPendingMigrations", () => {
  it("rolls back the whole migration when a statement fails mid-file", async () => {
    const idbName = `koloda-test-migrate-${Date.now()}`;
    const db = await openDb({ idbName });
    try {
      // A `reviews` shell without `card_id` makes V1 fail at its reviews index —
      // after algorithms, decks, and cards have already applied in the same file.
      // Without a transaction around the migration those earlier tables persist.
      await db.exec("CREATE TABLE reviews (id)");
      await expect(applyPendingMigrations(db)).rejects.toThrow(/card_id/);

      expect(await getAppliedMigrationNames(db)).toEqual([]);
      const [{ leftovers }] = await db.all(
        "SELECT COUNT(*) AS leftovers FROM sqlite_master WHERE type = 'table' AND name IN ('algorithms', 'decks', 'cards', 'conversations')",
      );
      expect(leftovers).toBe(0);
    } finally {
      await db.close();
      await deleteIdb(idbName);
    }
  });

  it("renames the legacy __migrations bookkeeping table in place", async () => {
    const idbName = `koloda-test-migrate-legacy-${Date.now()}`;
    const db = await openDb({ idbName });
    try {
      // Simulate a pre-unification web database: bookkeeping under the legacy
      // name with V1 already recorded. The rename must preserve the records so
      // applied migrations are not re-run against existing tables.
      await db.exec(
        "CREATE TABLE __migrations (id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL, name TEXT NOT NULL, created_at INTEGER NOT NULL)",
      );
      await db.run("INSERT INTO __migrations (name, created_at) VALUES ('V1__init.sql', 0)");

      await applyPendingMigrations(db);

      const tables = await db.all("SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE '%migrations%'");
      expect(tables.map((row) => String(row.name))).toEqual(["_migrations"]);
      expect(await getAppliedMigrationNames(db)).toContain("V1__init.sql");
      const [{ reruns }] = await db.all("SELECT COUNT(*) AS reruns FROM _migrations WHERE name = 'V1__init.sql'");
      expect(reruns).toBe(1);
    } finally {
      await db.close();
      await deleteIdb(idbName);
    }
  });
});
