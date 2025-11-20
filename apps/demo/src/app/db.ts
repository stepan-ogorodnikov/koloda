import { PGlite } from "@electric-sql/pglite";
import { schema } from "@koloda/srs";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";

export const client = new PGlite("idb://koloda", {});
export const db = drizzle({ client, schema });

const migrationsFiles: Record<string, { default: string }> = import.meta.glob(
  "../../../../drizzle/*.sql",
  {
    query: "?raw",
    eager: true,
  },
);

// [filename-without-extenstion, { default: migrationSQL }][]
export const migrations: [string, { default: string }][] = Object.entries(migrationsFiles)
  .map(([k, v]) => {
    const full = k.split("/").pop() ?? "";
    const short = full.includes(".")
      ? full.slice(0, full.lastIndexOf("."))
      : full;

    return [short, v];
  });

export const MIGRATIONS_TABLE = sql.identifier("__migrations");
