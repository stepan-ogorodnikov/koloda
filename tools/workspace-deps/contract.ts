import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import ts from "typescript";

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
  references: WorkspaceReference[];
  unresolvable: UnresolvableReference[];
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

export function checkLibrary(pkgDir: string, root: string): LibraryCheckResult | null {
  const packageJsonPath = join(pkgDir, "package.json");
  if (!existsSync(packageJsonPath)) return null;

  let pkg: { name?: string; dependencies?: Record<string, string> };
  try {
    pkg = JSON.parse(readFileSync(packageJsonPath, "utf8"));
  } catch {
    return null;
  }
  if (!pkg.name?.startsWith(KOLODA_PREFIX)) return null;

  const references: WorkspaceReference[] = [];
  const unresolvable: UnresolvableReference[] = [];

  for (const file of walkProductionSources(pkgDir)) {
    const sourceText = readFileSync(file, "utf8");
    const collected = collectFromSource(relative(root, file).split(sep).join("/"), sourceText);
    references.push(...collected.references);
    unresolvable.push(...collected.unresolvable);
  }

  const { missing, phantom, badVersions } = compareDependencies({
    selfName: pkg.name,
    declared: pkg.dependencies ?? {},
    references,
  });

  return {
    name: pkg.name,
    packageJsonPath: relative(root, packageJsonPath).split(sep).join("/"),
    missing,
    phantom,
    badVersions,
    references,
    unresolvable,
  };
}

export function checkWorkspace(root: string): LibraryCheckResult[] {
  const libsRoot = join(root, "libs");
  const results: LibraryCheckResult[] = [];

  for (const entry of readdirSync(libsRoot)) {
    const pkgDir = join(libsRoot, entry);
    if (!statSync(pkgDir).isDirectory()) continue;
    const result = checkLibrary(pkgDir, root);
    if (result) results.push(result);
  }

  return results.sort((a, b) => a.name.localeCompare(b.name));
}

export function formatCheckFailures(results: LibraryCheckResult[]): string | null {
  const failing = results.filter(
    (r) => r.missing.length || r.phantom.length || r.badVersions.length || r.unresolvable.length,
  );
  if (failing.length === 0) return null;

  const lines: string[] = ["Workspace dependency mismatches:", ""];

  for (const result of failing) {
    lines.push(`${result.name} (${result.packageJsonPath})`);

    for (const name of result.missing) {
      const evidence = result.references
        .filter((ref) => ref.packageName === name)
        .sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.column - b.column);
      lines.push(`  missing:  ${name}`);
      for (const ref of evidence) {
        lines.push(`    ${ref.file}:${ref.line}:${ref.column} (${ref.kind}) ${ref.specifier}`);
      }
    }

    for (const name of result.phantom) {
      lines.push(`  phantom:  ${name}`);
    }

    for (const issue of result.badVersions) {
      lines.push(`  version:  ${issue.dependency} is "${issue.version}" (expected "workspace:*")`);
    }

    for (const ref of result.unresolvable) {
      lines.push(`  unresolvable: ${ref.file}:${ref.line}:${ref.column} (${ref.kind}) ${ref.detail}`);
    }

    lines.push("");
  }

  return lines.join("\n");
}
