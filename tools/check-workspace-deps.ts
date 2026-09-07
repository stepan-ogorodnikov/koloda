/**
 * Tripwire: each libs package.json `dependencies` must match @koloda workspace
 * imports in that package's production sources (missing + phantom). Libs must
 * sit in the layer table; imports must follow layer/peer/exclusive rules.
 *
 * Usage: bun run tools/check-workspace-deps.ts
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { checkWorkspace, formatCheckFailures } from "./workspace-deps/contract.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const { results, staleLayers } = checkWorkspace(root);
const report = formatCheckFailures(results, staleLayers);

if (report == null) {
  console.log("Workspace @koloda/* dependencies match imports and layer rules.");
  process.exit(0);
}

console.error(report);
process.exit(1);
