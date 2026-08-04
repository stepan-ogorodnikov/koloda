import { build } from "rolldown";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// WHY: Packaged builds only ship `dist/**`. Bundle `@koloda/ai` + AI SDK deps into
// main so release asar does not need workspace node_modules / TS sources.
await build({
  cwd: root,
  input: "src/main.ts",
  platform: "node",
  // WHY: Electron is provided by the runtime; the .node addon is loaded via createRequire.
  external: ["electron", /\.node$/],
  // WHY: CJS output has no real `import.meta`; map to Node CJS equivalents so
  // `createRequire` and path joins keep working (dev still runs src via tsx/esm).
  transform: {
    define: {
      "import.meta.url": "__import_meta_url",
      "import.meta.dirname": "__dirname",
    },
  },
  output: {
    file: "dist/main.cjs",
    format: "cjs",
    sourcemap: true,
    // WHY: AI SDK / providers use dynamic import(); keep one main.cjs for asar.
    codeSplitting: false,
    banner: 'var __import_meta_url = require("node:url").pathToFileURL(__filename).href;',
  },
  logLevel: "info",
});
