import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join, relative, sep } from "node:path";
import ts from "typescript";
import { LAYER_TABLE_PATH, buildLayerMap, compareDirection, staleLayerEntries } from "./layers.ts";
import type { DirectionIssue, Layer, PackageKind } from "./layers.ts";

export type ReferenceKind = "import" | "export" | "import-equals" | "dynamic-import" | "require";

export type WorkspaceReference = {
  packageName: string;
  specifier: string;
  file: string;
  line: number;
  column: number;
  kind: ReferenceKind;
};

export type UnresolvableReference = {
  file: string;
  line: number;
  column: number;
  kind: "dynamic-import" | "require";
  detail: string;
};

export type ManifestIssue = {
  packageName: string;
  dependency: string;
  version: string;
};

export type LibraryCheckResult = {
  name: string;
  packageJsonPath: string;
  missing: string[];
  phantom: string[];
  badVersions: ManifestIssue[];
  forbidden: DirectionIssue[];
  isUnclassified: boolean;
  references: WorkspaceReference[];
  unresolvable: UnresolvableReference[];
};

export type WorkspaceCheckResult = {
  results: LibraryCheckResult[];
  staleLayers: string[];
};

const SOURCE_EXT = /\.(ts|tsx|js|jsx|mjs|cjs)$/;
const TEST_FILE = /\.(test|spec)\.(ts|tsx|js|jsx|mjs|cjs)$/;
const SETUP_FILE = /(^|[/\\])test-setup\.(ts|tsx|js|jsx|mjs|cjs)$/;
const GENERATED_FILE = /\.gen\.(ts|tsx|js|jsx)$/;
const FIXTURES_DIR = /(^|[/\\])fixtures([/\\]|$)/;
const KOLODA_PREFIX = "@koloda/";

export function normalizeKolodaPackage(specifier: string): string | null {
  if (!specifier.startsWith(KOLODA_PREFIX)) return null;
  const rest = specifier.slice(KOLODA_PREFIX.length);
  if (!rest) return null;
  const name = rest.split("/")[0];
  if (!name) return null;
  return `${KOLODA_PREFIX}${name}`;
}

export function isProductionSource(filePath: string): boolean {
  const normalized = filePath.split(sep).join("/");
  if (!normalized.includes("/src/")) return false;
  if (!SOURCE_EXT.test(normalized)) return false;
  if (TEST_FILE.test(normalized)) return false;
  if (SETUP_FILE.test(normalized)) return false;
  if (GENERATED_FILE.test(normalized)) return false;
  if (FIXTURES_DIR.test(normalized)) return false;
  return true;
}

function scriptKindFor(fileName: string): ts.ScriptKind {
  if (fileName.endsWith(".tsx")) return ts.ScriptKind.TSX;
  if (fileName.endsWith(".jsx")) return ts.ScriptKind.JSX;
  if (fileName.endsWith(".ts")) return ts.ScriptKind.TS;
  return ts.ScriptKind.JS;
}

function positionOf(sourceFile: ts.SourceFile, node: ts.Node) {
  const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  return { line: line + 1, column: character + 1 };
}

function literalSpecifier(node: ts.Expression): string | undefined {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text;
  }
  return undefined;
}

export function collectFromSource(
  fileName: string,
  sourceText: string,
): { references: WorkspaceReference[]; unresolvable: UnresolvableReference[] } {
  const sourceFile = ts.createSourceFile(fileName, sourceText, ts.ScriptTarget.Latest, true, scriptKindFor(fileName));

  const references: WorkspaceReference[] = [];
  const unresolvable: UnresolvableReference[] = [];

  const recordLiteral = (specifier: string, node: ts.Node, kind: ReferenceKind) => {
    const packageName = normalizeKolodaPackage(specifier);
    if (!packageName) return;
    const { line, column } = positionOf(sourceFile, node);
    references.push({ packageName, specifier, file: fileName, line, column, kind });
  };

  const recordDynamic = (arg: ts.Expression, kind: "dynamic-import" | "require") => {
    const literal = literalSpecifier(arg);
    if (literal !== undefined) {
      recordLiteral(literal, arg, kind);
      return;
    }
    const { line, column } = positionOf(sourceFile, arg);
    unresolvable.push({
      file: fileName,
      line,
      column,
      kind,
      detail: "non-literal module specifier; workspace imports must use a literal specifier",
    });
  };

  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      recordLiteral(node.moduleSpecifier.text, node.moduleSpecifier, "import");
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      recordLiteral(node.moduleSpecifier.text, node.moduleSpecifier, "export");
    } else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference) &&
      node.moduleReference.expression &&
      ts.isStringLiteral(node.moduleReference.expression)
    ) {
      recordLiteral(node.moduleReference.expression.text, node.moduleReference.expression, "import-equals");
    } else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments.length === 1
    ) {
      recordDynamic(node.arguments[0]!, "dynamic-import");
    } else if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "require" &&
      node.arguments.length === 1
    ) {
      recordDynamic(node.arguments[0]!, "require");
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return { references, unresolvable };
}

export function compareDependencies(args: {
  selfName: string;
  declared: Record<string, string>;
  references: WorkspaceReference[];
}): {
  missing: string[];
  phantom: string[];
  badVersions: ManifestIssue[];
  imported: Set<string>;
} {
  const declaredKoloda = Object.entries(args.declared).filter(([name]) => name.startsWith(KOLODA_PREFIX));
  const declaredNames = new Set(declaredKoloda.map(([name]) => name));

  const imported = new Set(args.references.map((ref) => ref.packageName).filter((name) => name !== args.selfName));

  const missing = [...imported].filter((name) => !declaredNames.has(name)).sort();
  const phantom = [...declaredNames].filter((name) => !imported.has(name)).sort();
  const badVersions = declaredKoloda
    .filter(([, version]) => version !== "workspace:*")
    .map(([dependency, version]) => ({ packageName: args.selfName, dependency, version }))
    .sort((a, b) => a.dependency.localeCompare(b.dependency));

  return { missing, phantom, badVersions, imported };
}

function walkProductionSources(pkgDir: string): string[] {
  const srcDir = join(pkgDir, "src");
  if (!existsSync(srcDir)) return [];

  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      if (entry === "node_modules" || entry === "dist" || entry === "coverage") continue;
      const path = join(dir, entry);
      const st = statSync(path);
      if (st.isDirectory()) {
        walk(path);
        continue;
      }
      if (isProductionSource(path.split(sep).join("/"))) out.push(path);
    }
  };
  walk(srcDir);
  return out;
}

type DiscoveredPackage = {
  name: string;
  kind: PackageKind;
  pkgDir: string;
  manifestPath: string | null;
  declared: Record<string, string>;
};

function readManifest(packageJsonPath: string): { name?: string; dependencies?: Record<string, string> } | null {
  try {
    return JSON.parse(readFileSync(packageJsonPath, "utf8"));
  } catch {
    return null;
  }
}

function discoverWorkspacePackages(root: string): DiscoveredPackage[] {
  const discovered: DiscoveredPackage[] = [];

  for (const kind of ["lib", "app"] as const) {
    const parent = join(root, kind === "lib" ? "libs" : "apps");
    if (!existsSync(parent)) continue;

    for (const entry of readdirSync(parent)) {
      const pkgDir = join(parent, entry);
      if (!statSync(pkgDir).isDirectory()) continue;

      const packageJsonPath = join(pkgDir, "package.json");
      if (existsSync(packageJsonPath)) {
        const pkg = readManifest(packageJsonPath);
        if (!pkg?.name?.startsWith(KOLODA_PREFIX)) continue;
        discovered.push({
          name: pkg.name,
          kind,
          pkgDir,
          manifestPath: packageJsonPath,
          declared: pkg.dependencies ?? {},
        });
        continue;
      }

      if (kind === "app") {
        discovered.push({
          name: `${KOLODA_PREFIX}${basename(pkgDir)}`,
          kind,
          pkgDir,
          manifestPath: null,
          declared: {},
        });
      }
    }
  }

  return discovered;
}

function collectPackageSources(
  pkgDir: string,
  root: string,
): { references: WorkspaceReference[]; unresolvable: UnresolvableReference[] } {
  const references: WorkspaceReference[] = [];
  const unresolvable: UnresolvableReference[] = [];

  for (const file of walkProductionSources(pkgDir)) {
    const sourceText = readFileSync(file, "utf8");
    const collected = collectFromSource(relative(root, file).split(sep).join("/"), sourceText);
    references.push(...collected.references);
    unresolvable.push(...collected.unresolvable);
  }

  return { references, unresolvable };
}

function checkDiscoveredPackage(
  pkg: DiscoveredPackage,
  root: string,
  layers: ReadonlyMap<string, Layer | null>,
): LibraryCheckResult {
  const { references, unresolvable } = collectPackageSources(pkg.pkgDir, root);
  const compared = compareDependencies({
    selfName: pkg.name,
    declared: pkg.declared,
    references,
  });
  const { isUnclassified, forbidden } = compareDirection({
    selfName: pkg.name,
    imported: compared.imported,
    layers,
  });

  const packageJsonPath = pkg.manifestPath
    ? relative(root, pkg.manifestPath).split(sep).join("/")
    : relative(root, pkg.pkgDir).split(sep).join("/");

  const isLib = pkg.kind === "lib";

  return {
    name: pkg.name,
    packageJsonPath,
    missing: isLib ? compared.missing : [],
    phantom: isLib ? compared.phantom : [],
    badVersions: isLib ? compared.badVersions : [],
    forbidden,
    isUnclassified,
    references,
    unresolvable: isLib ? unresolvable : [],
  };
}

export function checkWorkspace(root: string): WorkspaceCheckResult {
  const discovered = discoverWorkspacePackages(root);
  const layers = buildLayerMap(discovered);
  const results = discovered
    .map((pkg) => checkDiscoveredPackage(pkg, root, layers))
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    results,
    staleLayers: staleLayerEntries(discovered.map((pkg) => pkg.name)),
  };
}

function hasPackageFailure(result: LibraryCheckResult): boolean {
  return Boolean(
    result.missing.length ||
    result.phantom.length ||
    result.badVersions.length ||
    result.unresolvable.length ||
    result.forbidden.length ||
    result.isUnclassified,
  );
}

function evidenceFor(result: LibraryCheckResult, packageName: string): WorkspaceReference[] {
  return result.references
    .filter((ref) => ref.packageName === packageName)
    .sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.column - b.column);
}

export function formatCheckFailures(results: LibraryCheckResult[], staleLayers: string[] = []): string | null {
  const failing = results.filter(hasPackageFailure);
  if (failing.length === 0 && staleLayers.length === 0) return null;

  const lines: string[] = ["Workspace dependency check failed:", ""];

  for (const name of staleLayers) {
    lines.push(`stale layer: ${name} is listed in ${LAYER_TABLE_PATH} but was not found under libs/ or apps/`);
  }
  if (staleLayers.length) lines.push("");

  for (const result of failing) {
    lines.push(`${result.name} (${result.packageJsonPath})`);

    if (result.isUnclassified) {
      lines.push(`  unclassified: add this package to ${LAYER_TABLE_PATH}`);
    }

    for (const name of result.missing) {
      lines.push(`  missing:  ${name}`);
      for (const ref of evidenceFor(result, name)) {
        lines.push(`    ${ref.file}:${ref.line}:${ref.column} (${ref.kind}) ${ref.specifier}`);
      }
    }

    for (const name of result.phantom) {
      lines.push(`  phantom:  ${name}`);
    }

    for (const issue of result.badVersions) {
      lines.push(`  version:  ${issue.dependency} is "${issue.version}" (expected "workspace:*")`);
    }

    for (const issue of result.forbidden) {
      lines.push(`  forbidden: ${issue.reason}`);
      for (const ref of evidenceFor(result, issue.dependency)) {
        lines.push(`    ${ref.file}:${ref.line}:${ref.column} (${ref.kind}) ${ref.specifier}`);
      }
    }

    for (const ref of result.unresolvable) {
      lines.push(`  unresolvable: ${ref.file}:${ref.line}:${ref.column} (${ref.kind}) ${ref.detail}`);
    }

    lines.push("");
  }

  return lines.join("\n");
}
