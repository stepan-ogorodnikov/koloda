import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  driver: "pglite",
  out: "./drizzle",
  schema: "./libs/srs/src/lib/schema.ts",
});
