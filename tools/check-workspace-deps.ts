/**
 * Tripwire: each libs package.json `dependencies` must match @koloda workspace
 * imports in that package's production sources (missing + phantom).
 *
 * Usage: bun run tools/check-workspace-deps.ts
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { checkWorkspace, formatCheckFailures } from "./workspace-deps/contract.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const results = checkWorkspace(root);
const report = formatCheckFailures(results);

if (report == null) {
  console.log("Workspace @koloda/* dependencies match imports.");
  process.exit(0);
}

console.error(report);
process.exit(1);
