import type { DB } from "./db";
import { nowMs } from "./sql";

const MIGRATIONS_TABLE = "__migrations";

const migrationFiles: Record<string, { default: string }> = import.meta.glob(
  "../../../../crates/koloda/src/migrations/*.sql",
  {
    query: "?raw",
    eager: true,
  },
);

function nameFromPath(path: string) {
  const full = path.split("/").pop() ?? "";
  return full.includes(".") ? full.slice(0, full.lastIndexOf(".")) : full;
}

function entriesFromGlob(): [string, string][] {
  return Object.entries(migrationFiles)
    .map(([path, mod]) => [nameFromPath(path), mod.default] as [string, string])
    .sort(([a], [b]) => a.localeCompare(b));
}

async function loadMigrationEntries(): Promise<[string, string][]> {
  const fromGlob = entriesFromGlob();
  if (fromGlob.length > 0) return fromGlob;

  // WHY: Vitest can miss a glob outside the lib; Node tests still need V1–V5 applied.
  const { readdir, readFile } = await import("node:fs/promises");
  const { dirname, resolve } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const dir = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../crates/koloda/src/migrations");
  const files = (await readdir(dir)).filter((file) => file.endsWith(".sql")).sort();
  return Promise.all(
    files.map(async (file) => {
      const sql = await readFile(resolve(dir, file), "utf8");
      return [nameFromPath(file), sql] as [string, string];
    }),
  );
}

export async function ensureMigrationsTable(db: DB) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      name TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )
  `);
}

export async function getAppliedMigrationNames(db: DB): Promise<string[]> {
  const rows = await db.all(`SELECT name FROM ${MIGRATIONS_TABLE} ORDER BY id`);
  return rows.map((row) => String(row.name));
}

export async function applyPendingMigrations(db: DB) {
  await ensureMigrationsTable(db);
  const applied = new Set(await getAppliedMigrationNames(db));
  const createdAt = nowMs();

  for (const [name, sql] of await loadMigrationEntries()) {
    if (applied.has(name)) continue;
    await db.exec(sql);
    await db.run(`INSERT INTO ${MIGRATIONS_TABLE} (name, created_at) VALUES (?, ?)`, [name, createdAt]);
  }
}

export async function getStatus(db: DB) {
  await ensureMigrationsTable(db);
  const applied = await getAppliedMigrationNames(db);
  if (applied.length === 0) return "blank" as const;
  await applyPendingMigrations(db);
  return "ok" as const;
}
