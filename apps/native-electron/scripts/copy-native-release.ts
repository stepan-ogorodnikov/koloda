import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const __dirname = import.meta.dirname!;
const platform = process.platform;
const ext = platform === "win32" ? ".dll" : platform === "darwin" ? ".dylib" : ".so";
const prefix = platform === "win32" ? "" : "lib";

const srcPath = join(__dirname, "..", "..", "..", "target", "release", `${prefix}koloda_electron${ext}`);
const distDir = join(__dirname, "..", "dist");
const dstPath = join(distDir, "koloda_electron.node");

if (!existsSync(srcPath)) {
  console.error(`Native addon not found at ${srcPath}. Run \`cargo build -p koloda-electron --release\` first.`);
  process.exit(1);
}

if (!existsSync(distDir)) {
  mkdirSync(distDir, { recursive: true });
}

copyFileSync(srcPath, dstPath);
console.log(`Copied native addon for release: ${dstPath}`);
