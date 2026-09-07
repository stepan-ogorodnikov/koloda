import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  driver: "pglite",
  out: "./drizzle/pgsql",
  schema: "./libs/db-pglite/src/lib/schema.ts",
});
