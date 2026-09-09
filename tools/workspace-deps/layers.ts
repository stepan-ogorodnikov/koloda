export type Layer = "domain" | "persistence" | "ipc" | "data" | "ui" | "feature" | "shell" | "e2e" | "app";

export type PackageKind = "lib" | "app";

export type DirectionIssue = {
  dependency: string;
  reason: string;
};

/** Libs only. Apps are composition roots (`app`) and are not listed here. */
export const PACKAGE_LAYERS: Record<string, Exclude<Layer, "app">> = {
  "@koloda/app": "domain",
  "@koloda/srs": "domain",
  "@koloda/ai": "domain",
  "@koloda/settings": "domain",
  "@koloda/assistant": "domain",
  "@koloda/db-pglite": "persistence",
  "@koloda/db-sqlite": "persistence",
  "@koloda/native-ipc": "ipc",
  "@koloda/core-react": "data",
  "@koloda/ui": "ui",
  "@koloda/srs-react": "feature",
  "@koloda/ai-react": "feature",
  "@koloda/assistant-react": "feature",
  "@koloda/settings-react": "feature",
  "@koloda/app-react": "shell",
  "@koloda/e2e": "e2e",
};

/** Same-layer feature imports that are allowed. Missing from this list is a violation. */
export const FEATURE_PEERS: Record<string, readonly string[]> = {
  "@koloda/assistant-react": ["@koloda/ai-react"],
  "@koloda/settings-react": ["@koloda/ai-react", "@koloda/srs-react"],
};

/** These packages may be imported only by the listed consumers. */
export const EXCLUSIVE_CONSUMERS: Record<string, readonly string[]> = {
  "@koloda/db-pglite": ["@koloda/web"],
  "@koloda/native-ipc": ["@koloda/electron", "@koloda/electron-react"],
  "@koloda/e2e": ["@koloda/web-e2e", "@koloda/electron-e2e"],
};

const LAYER_MAY_IMPORT: Record<Layer, ReadonlySet<Layer>> = {
  domain: new Set(["domain"]),
  persistence: new Set(["domain"]),
  ipc: new Set(["domain"]),
  data: new Set(["domain"]),
  ui: new Set(["domain", "data"]),
  feature: new Set(["domain", "data", "ui"]),
  shell: new Set(["domain", "data", "ui", "feature"]),
  e2e: new Set(),
  app: new Set(),
};

export const LAYER_TABLE_PATH = "tools/workspace-deps/layers.ts";

export function classifyPackage(packageName: string, kind: PackageKind): Layer | null {
  const listed = PACKAGE_LAYERS[packageName];
  if (listed) return listed;
  if (kind === "app") return "app";
  return null;
}

export function buildLayerMap(packages: readonly { name: string; kind: PackageKind }[]): Map<string, Layer | null> {
  const map = new Map<string, Layer | null>();
  for (const pkg of packages) {
    map.set(pkg.name, classifyPackage(pkg.name, pkg.kind));
  }
  return map;
}

export function staleLayerEntries(discovered: Iterable<string>): string[] {
  const found = new Set(discovered);
  return Object.keys(PACKAGE_LAYERS)
    .filter((name) => !found.has(name))
    .sort();
}

export function forbiddenImportReason(
  from: string,
  to: string,
  layers: ReadonlyMap<string, Layer | null>,
): string | null {
  if (from === to) return null;

  const exclusive = EXCLUSIVE_CONSUMERS[to];
  if (exclusive && !exclusive.includes(from)) {
    return `${to} is exclusive to ${exclusive.join(", ")}`;
  }

  if (!layers.has(to)) return null;

  const fromLayer = layers.get(from) ?? null;
  const toLayer = layers.get(to) ?? null;

  if (fromLayer == null) return null;
  if (toLayer == null) return `${to} is not classified in ${LAYER_TABLE_PATH}`;
  if (fromLayer === "app") return null;

  if (fromLayer === "feature" && toLayer === "feature") {
    const peers = FEATURE_PEERS[from] ?? [];
    if (peers.includes(to)) return null;
    return `${to} is not a listed feature peer of ${from}`;
  }

  if (LAYER_MAY_IMPORT[fromLayer].has(toLayer)) return null;
  return `${fromLayer} cannot import ${toLayer} (${to})`;
}

export function compareDirection(args: {
  selfName: string;
  imported: Iterable<string>;
  layers: ReadonlyMap<string, Layer | null>;
}): { isUnclassified: boolean; forbidden: DirectionIssue[] } {
  const isUnclassified = (args.layers.get(args.selfName) ?? null) == null;
  const forbidden: DirectionIssue[] = [];

  for (const dependency of args.imported) {
    const reason = forbiddenImportReason(args.selfName, dependency, args.layers);
    if (reason) forbidden.push({ dependency, reason });
  }

  forbidden.sort((a, b) => a.dependency.localeCompare(b.dependency) || a.reason.localeCompare(b.reason));
  return { isUnclassified, forbidden };
}
