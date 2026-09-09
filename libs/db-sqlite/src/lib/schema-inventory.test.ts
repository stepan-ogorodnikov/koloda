import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { DB } from "./db";
import type { TestDb } from "../test/test-helpers";
import { createTestDb } from "../test/test-helpers";

const BOOKKEEPING_TABLES = new Set(["_migrations", "__migrations"]);

const SNAPSHOT_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../crates/koloda/src/migrations/schema-inventory.json",
);

type SchemaInventory = {
  tables: TableInventory[];
};

type TableInventory = {
  name: string;
  columns: ColumnInventory[];
  indexes: IndexInventory[];
  foreign_keys: ForeignKeyInventory[];
};

type ColumnInventory = {
  name: string;
  type: string;
  notnull: number;
  pk: number;
  dflt_value: string | null;
};

type IndexInventory = {
  name: string;
  unique: number;
  columns: string[];
};

type ForeignKeyInventory = {
  table: string;
  from: string;
  to: string;
  on_delete: string;
  on_update: string;
};

function isSafeIdent(name: string) {
  return /^[A-Za-z0-9_]+$/.test(name);
}

function asInt(value: unknown) {
  return Number(value);
}

function asText(value: unknown) {
  return value == null ? null : String(value);
}

async function dumpSchema(db: DB): Promise<SchemaInventory> {
  const tableRows = await db.all(
    `SELECT name FROM sqlite_master
     WHERE type = 'table'
       AND name NOT LIKE 'sqlite_%'
     ORDER BY name`,
  );
  const tables: TableInventory[] = [];

  for (const row of tableRows) {
    const name = String(row.name);
    if (BOOKKEEPING_TABLES.has(name)) continue;
    if (!isSafeIdent(name)) throw new Error(`unexpected table name ${name}`);
    tables.push({
      name,
      columns: await dumpColumns(db, name),
      indexes: await dumpIndexes(db, name),
      foreign_keys: await dumpForeignKeys(db, name),
    });
  }

  return { tables };
}

async function dumpColumns(db: DB, table: string): Promise<ColumnInventory[]> {
  const rows = await db.all(`PRAGMA table_info(${table})`);
  return rows
    .map((row) => ({
      name: String(row.name),
      type: String(row.type).toUpperCase(),
      notnull: asInt(row.notnull),
      pk: asInt(row.pk),
      dflt_value: asText(row.dflt_value),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

async function dumpIndexes(db: DB, table: string): Promise<IndexInventory[]> {
  const listed = await db.all(`PRAGMA index_list(${table})`);
  const indexes: IndexInventory[] = [];

  for (const row of listed) {
    const name = String(row.name);
    if (!isSafeIdent(name)) throw new Error(`unexpected index name ${name}`);
    const info = await db.all(`PRAGMA index_info(${name})`);
    indexes.push({
      name,
      unique: asInt(row.unique),
      columns: info.map((entry) => String(entry.name)),
    });
  }

  return indexes.sort((a, b) => a.name.localeCompare(b.name));
}

async function dumpForeignKeys(db: DB, table: string): Promise<ForeignKeyInventory[]> {
  const rows = await db.all(`PRAGMA foreign_key_list(${table})`);
  return rows
    .map((row) => ({
      table: String(row.table),
      from: String(row.from),
      to: String(row.to),
      on_update: String(row.on_update).toUpperCase(),
      on_delete: String(row.on_delete).toUpperCase(),
    }))
    .sort((a, b) => a.from.localeCompare(b.from) || a.table.localeCompare(b.table) || a.to.localeCompare(b.to));
}

describe("schema inventory", () => {
  let testDb: TestDb;

  beforeEach(async () => {
    testDb = await createTestDb();
  });

  afterEach(async () => {
    await testDb.close();
  });

  it("matches the committed product schema snapshot", async () => {
    const actual = await dumpSchema(testDb.db);
    const expected = JSON.parse(readFileSync(SNAPSHOT_PATH, "utf8")) as SchemaInventory;
    expect(actual).toEqual(expected);
  });
});
