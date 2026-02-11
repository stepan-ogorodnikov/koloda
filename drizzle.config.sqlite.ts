import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  out: "./drizzle/sqlite",
  schema: "./libs/srs-sqlite/src/lib/schema.ts",
});
