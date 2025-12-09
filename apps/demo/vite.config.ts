/// <reference types='vitest' />
import { lingui } from "@lingui/vite-plugin";
import { nxViteTsPaths } from "@nx/vite/plugins/nx-tsconfig-paths.plugin";
import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react-swc";
import { defineConfig } from "vite";

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
  plugins: [
    devtools(),
    tanstackRouter({
      target: "react",
      autoCodeSplitting: true,
      routesDirectory: "./libs/react/src/lib/routes",
      generatedRouteTree: "./libs/react/src/lib/routeTree.gen.ts",
    }),
    react({
      plugins: [["@lingui/swc-plugin", {}]],
    }),
    tailwindcss(),
    lingui(),
    nxViteTsPaths(),
  ],
  // Uncomment this if you are using workers.
  // worker: {
  //  plugins: [ nxViteTsPaths() ],
  // },
  build: {
    outDir: "./dist",
    emptyOutDir: true,
    reportCompressedSize: true,
    commonjsOptions: {
      transformMixedEsModules: true,
    },
  },
  optimizeDeps: {
    exclude: ["@electric-sql/pglite"],
  },
}));
