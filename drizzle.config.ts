import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  driver: "pglite",
  out: "./drizzle/pgsql",
  schema: "./libs/srs-pgsql/src/lib/schema.ts",
});
