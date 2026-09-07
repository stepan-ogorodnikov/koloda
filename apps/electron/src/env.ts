import { app } from "electron";

export const isDev = !app.isPackaged;

// WHY: dev (tsx) resolves to src/, packaged (bundle-main) remaps to the bundled main.cjs's
// __dirname — both are the main entry's dir. Keep this module flat in src/ or dev paths break.
export const appDir = import.meta.dirname!;
