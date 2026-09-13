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
});
