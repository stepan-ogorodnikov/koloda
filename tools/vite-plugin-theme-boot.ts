import { copyFileSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";

const themeBootPath = resolve(dirname(fileURLToPath(import.meta.url)), "../libs/app-react/public/theme-boot.js");

/** Serves and copies theme-boot.js so last-used theme can paint before CSS. */
export function themeBootPlugin(): Plugin {
  return {
    name: "koloda-theme-boot",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url?.split("?")[0];
        if (url === "/theme-boot.js" || url?.endsWith("/theme-boot.js")) {
          res.setHeader("Content-Type", "application/javascript");
          res.end(readFileSync(themeBootPath));
          return;
        }
        next();
      });
    },
    writeBundle(options) {
      if (options.dir) copyFileSync(themeBootPath, resolve(options.dir, "theme-boot.js"));
    },
  };
}
