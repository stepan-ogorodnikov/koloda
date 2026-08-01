/// <reference types='vitest' />
import { lingui } from "@lingui/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react-swc";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig(() => ({
  root: __dirname,
  base: process.env.VITE_BASE || "/",
  cacheDir: "../../node_modules/.vite/apps/demo",
  server: {
    port: 3000,
    host: "localhost",
  },
  preview: {
    port: 3000,
    host: "localhost",
  },
  resolve: {
    tsconfigPaths: true,
  },
  plugins: [
    tanstackRouter({
      target: "react",
      autoCodeSplitting: true,
      routesDirectory: resolve(__dirname, "../../libs/app-react/src/lib/routes"),
      generatedRouteTree: resolve(__dirname, "../../libs/app-react/src/lib/routeTree.gen.ts"),
    }),
    react({
      plugins: [["@lingui/swc-plugin", {}]],
    }),
    tailwindcss(),
    lingui(),
  ],
  build: {
    outDir: "../../dist/apps/demo",
    emptyOutDir: true,
    reportCompressedSize: true,
  },
  optimizeDeps: {
    exclude: ["@electric-sql/pglite", "@koloda/srs"],
  },
}));
