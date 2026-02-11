/// <reference types='vitest' />
import { lingui } from "@lingui/vite-plugin";
import { nxViteTsPaths } from "@nx/vite/plugins/nx-tsconfig-paths.plugin";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react-swc";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig(() => ({
  root: __dirname,
  base: "/",
  cacheDir: "../../node_modules/.vite/apps/native-tauri-react",
  server: {
    port: 3000,
    host: "localhost",
    fs: {
      allow: ["..", "../.."],
    },
  },
  preview: {
    port: 3000,
    host: "localhost",
  },
  plugins: [
    nxViteTsPaths(),
    tanstackRouter({
      target: "react",
      autoCodeSplitting: true,
      routesDirectory: resolve(__dirname, "../../libs/react/src/lib/routes"),
      generatedRouteTree: resolve(__dirname, "../../libs/react/src/lib/routeTree.gen.ts"),
    }),
    react({
      plugins: [["@lingui/swc-plugin", {}]],
    }),
    tailwindcss(),
    lingui(),
  ],
  // Uncomment this if you are using workers.
  // worker: {
  //  plugins: [ nxViteTsPaths() ],
  // },
  build: {
    outDir: "../../dist/apps/native-tauri-react",
    emptyOutDir: true,
    reportCompressedSize: true,
    commonjsOptions: {
      transformMixedEsModules: true,
    },
  },
}));
