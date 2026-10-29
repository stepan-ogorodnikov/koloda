/// <reference types='vitest' />
import { lingui } from "@lingui/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react-swc";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { themeBootPlugin } from "../../tools/vite-plugin-theme-boot.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig(() => ({
  root: __dirname,
  cacheDir: "../../node_modules/.vite/apps/design-system",
  server: {
    port: 3100,
    host: "localhost",
    fs: {
      allow: [resolve(__dirname, "../..")],
    },
  },
  preview: {
    port: 3100,
    host: "localhost",
  },
  resolve: {
    tsconfigPaths: true,
  },
  plugins: [
    react({
      plugins: [["@lingui/swc-plugin", {}]],
    }),
    tailwindcss(),
    lingui(),
    themeBootPlugin(),
  ],
  build: {
    outDir: "../../dist/apps/design-system",
    emptyOutDir: true,
    reportCompressedSize: true,
  },
}));
