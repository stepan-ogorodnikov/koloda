import type { DB } from "./db";
import { nowMs } from "./sql";

// INVARIANT: both hosts record applied versions in `_migrations` (desktop twin:
// MIGRATIONS_TABLE in crates/koloda/src/app/db.rs) — one shared name over the
// shared V*.sql series.
const MIGRATIONS_TABLE = "_migrations";
const LEGACY_MIGRATIONS_TABLE = "__migrations";

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

// WHY: Refinery orders the series by the numeric V prefix; lexicographic compare
// would apply V10 before V2 and silently diverge the web schema from desktop.
export function compareMigrationNames(a: string, b: string) {
  return a.localeCompare(b, undefined, { numeric: true });
}

function entriesFromGlob(): [string, string][] {
  return Object.entries(migrationFiles)
    .map(([path, mod]) => [nameFromPath(path), mod.default] as [string, string])
    .sort(([a], [b]) => compareMigrationNames(a, b));
}

async function loadMigrationEntries(): Promise<[string, string][]> {
  const fromGlob = entriesFromGlob();
  if (fromGlob.length > 0) return fromGlob;

  // WHY: Vitest can miss a glob outside the lib; Node tests still need the SQL series applied.
  const { readdir, readFile } = await import("node:fs/promises");
  const { dirname, resolve } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const dir = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../crates/koloda/src/migrations");
  const files = (await readdir(dir)).filter((file) => file.endsWith(".sql")).sort(compareMigrationNames);
  return Promise.all(
    files.map(async (file) => {
      const sql = await readFile(resolve(dir, file), "utf8");
      return [nameFromPath(file), sql] as [string, string];
    }),
  );
}

export async function ensureMigrationsTable(db: DB) {
  const tables = await db.all(`SELECT name FROM sqlite_master WHERE type = 'table' AND name IN (?, ?)`, [
    MIGRATIONS_TABLE,
    LEGACY_MIGRATIONS_TABLE,
  ]);
  const names = new Set(tables.map((row) => String(row.name)));

  // WHY: pre-unification web databases tracked applied versions in `__migrations`.
  // Renaming preserves the records so applied migrations are never re-run against
  // existing tables; the legacy name exists nowhere else afterwards.
  if (names.has(LEGACY_MIGRATIONS_TABLE)) {
    if (names.has(MIGRATIONS_TABLE)) {
      await db.exec(`DROP TABLE ${LEGACY_MIGRATIONS_TABLE}`);
    } else {
      await db.exec(`ALTER TABLE ${LEGACY_MIGRATIONS_TABLE} RENAME TO ${MIGRATIONS_TABLE}`);
    }
    return;
  }

  if (!names.has(MIGRATIONS_TABLE)) {
    await db.exec(`
      CREATE TABLE ${MIGRATIONS_TABLE} (
        id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
        name TEXT NOT NULL,
        created_at INTEGER NOT NULL
      )
    `);
  }
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
    // WHY: Refinery applies each migration in its own transaction — a mid-migration
    // failure must roll back the DDL instead of leaving a half-applied schema with no
    // bookkeeping row. Nested callers (setupFromScratch) keep their outer transaction.
    await db.transaction(async (tx) => {
      await tx.exec(sql);
      await tx.run(`INSERT INTO ${MIGRATIONS_TABLE} (name, created_at) VALUES (?, ?)`, [name, createdAt]);
    });
  }
}

// WHY: The status query doubles as web's upgrade hook — the lazy counterpart of
// desktop's eager refinery run at startup. Pending migrations apply here on
// purpose, so a queryFn that writes is correct. Safe because seeding is one
// transaction (apps/web `setupFromScratch`): an interrupted setup rolls the
// bookkeeping back too, status stays "blank", and it only flips to "ok" in a
// fully migrated, seed-capable state. Desktop twin `get_db_status`
// (crates/koloda/src/app/init.rs) is a pure read for that reason.
export async function getStatus(db: DB) {
  await ensureMigrationsTable(db);
  const applied = await getAppliedMigrationNames(db);
  if (applied.length === 0) return "blank" as const;
  await applyPendingMigrations(db);
  return "ok" as const;
}
