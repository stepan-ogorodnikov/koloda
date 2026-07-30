import { describe, expect, it } from "vitest";
import {
  collectFromSource,
  compareDependencies,
  formatCheckFailures,
  isProductionSource,
  normalizeKolodaPackage,
  type LibraryCheckResult,
} from "./contract.ts";

describe("normalizeKolodaPackage", () => {
  it("normalizes subpaths to the package root", () => {
    expect(normalizeKolodaPackage("@koloda/ui")).toBe("@koloda/ui");
    expect(normalizeKolodaPackage("@koloda/ui/primitives")).toBe("@koloda/ui");
    expect(normalizeKolodaPackage("react")).toBeNull();
    expect(normalizeKolodaPackage("@koloda/")).toBeNull();
  });
});

describe("isProductionSource", () => {
  it("keeps production sources and excludes tests, setup, fixtures, and generated files", () => {
    expect(isProductionSource("libs/ui/src/lib/button.tsx")).toBe(true);
    expect(isProductionSource("libs/ui/src/lib/button.test.tsx")).toBe(false);
    expect(isProductionSource("libs/ui/src/lib/button.spec.ts")).toBe(false);
    expect(isProductionSource("libs/ui/src/test-setup.ts")).toBe(false);
    expect(isProductionSource("libs/ui/src/fixtures/sample.ts")).toBe(false);
    expect(isProductionSource("libs/app-react/src/lib/routes/routeTree.gen.ts")).toBe(false);
    expect(isProductionSource("libs/ui/package.json")).toBe(false);
  });
});

describe("collectFromSource", () => {
  it("collects ordinary and type-only imports", () => {
    const { references, unresolvable } = collectFromSource(
      "libs/app/src/lib/settings.ts",
      `
        import { aiSettingsValidation } from "@koloda/ai";
        import type { AISecrets } from "@koloda/ai";
      `,
    );
    expect(unresolvable).toEqual([]);
    expect(references.map((r) => r.kind)).toEqual(["import", "import"]);
    expect(references.every((r) => r.packageName === "@koloda/ai")).toBe(true);
    expect(references[0]).toMatchObject({
      file: "libs/app/src/lib/settings.ts",
      line: 2,
      kind: "import",
    });
  });

  it("collects side-effect imports and re-exports", () => {
    const { references } = collectFromSource(
      "libs/demo/src/index.ts",
      `
        import "@koloda/ui";
        export { Button } from "@koloda/ui";
        export * from "@koloda/core-react";
      `,
    );
    expect(references.map((r) => [r.kind, r.packageName])).toEqual([
      ["import", "@koloda/ui"],
      ["export", "@koloda/ui"],
      ["export", "@koloda/core-react"],
    ]);
  });

  it("collects static import() and require() calls", () => {
    const { references, unresolvable } = collectFromSource(
      "libs/ai/src/lib/load.ts",
      `
        const a = await import("@koloda/ai");
        const b = require("@koloda/app");
        import ai = require("@koloda/ai");
      `,
    );
    expect(unresolvable).toEqual([]);
    expect(references.map((r) => [r.kind, r.packageName])).toEqual([
      ["dynamic-import", "@koloda/ai"],
      ["require", "@koloda/app"],
      ["import-equals", "@koloda/ai"],
    ]);
  });

  it("normalizes subpath imports", () => {
    const { references } = collectFromSource("libs/x/src/a.ts", `import { x } from "@koloda/ui/primitives/button";`);
    expect(references[0]?.packageName).toBe("@koloda/ui");
    expect(references[0]?.specifier).toBe("@koloda/ui/primitives/button");
  });

  it("ignores comments and string text that resemble imports", () => {
    const { references, unresolvable } = collectFromSource(
      "libs/x/src/a.ts",
      `
        // import { x } from "@koloda/ai";
        const msg = 'from "@koloda/ui"';
        const other = "import('@koloda/app')";
      `,
    );
    expect(references).toEqual([]);
    expect(unresolvable).toEqual([]);
  });

  it("rejects every non-literal dynamic import and require call", () => {
    const { references, unresolvable } = collectFromSource(
      "libs/x/src/a.ts",
      `
        const name = "ai";
        await import(\`@koloda/\${name}\`);
        require("@koloda/" + name);
        await import(name);
      `,
    );
    expect(references).toEqual([]);
    expect(unresolvable).toHaveLength(3);
    expect(unresolvable.map((u) => u.kind).sort()).toEqual(["dynamic-import", "dynamic-import", "require"]);
  });
});

describe("compareDependencies", () => {
  it("reports missing, phantom, and non-workspace versions", () => {
    const { missing, phantom, badVersions } = compareDependencies({
      selfName: "@koloda/app-react",
      declared: {
        "@koloda/app": "workspace:*",
        "@koloda/srs": "workspace:*",
        "@koloda/ai": "^1.0.0",
      },
      references: [
        {
          packageName: "@koloda/app",
          specifier: "@koloda/app",
          file: "a.ts",
          line: 1,
          column: 1,
          kind: "import",
        },
        {
          packageName: "@koloda/ui",
          specifier: "@koloda/ui",
          file: "b.ts",
          line: 2,
          column: 3,
          kind: "import",
        },
        {
          packageName: "@koloda/ai",
          specifier: "@koloda/ai",
          file: "c.ts",
          line: 3,
          column: 1,
          kind: "import",
        },
        {
          packageName: "@koloda/app-react",
          specifier: "@koloda/app-react",
          file: "d.ts",
          line: 4,
          column: 1,
          kind: "import",
        },
      ],
    });

    expect(missing).toEqual(["@koloda/ui"]);
    expect(phantom).toEqual(["@koloda/srs"]);
    expect(badVersions).toEqual([{ packageName: "@koloda/app-react", dependency: "@koloda/ai", version: "^1.0.0" }]);
  });
});

describe("formatCheckFailures", () => {
  it("emits stable diagnostics with source locations", () => {
    const result: LibraryCheckResult = {
      name: "@koloda/app",
      packageJsonPath: "libs/app/package.json",
      missing: ["@koloda/ai"],
      phantom: ["@koloda/srs"],
      badVersions: [{ packageName: "@koloda/app", dependency: "@koloda/ui", version: "*" }],
      references: [
        {
          packageName: "@koloda/ai",
          specifier: "@koloda/ai",
          file: "libs/app/src/lib/settings.ts",
          line: 1,
          column: 40,
          kind: "import",
        },
      ],
      unresolvable: [
        {
          file: "libs/app/src/lib/load.ts",
          line: 4,
          column: 16,
          kind: "dynamic-import",
          detail: "non-literal module specifier; workspace imports must use a literal specifier",
        },
      ],
    };

    expect(formatCheckFailures([result])).toBe(
      [
        "Workspace dependency mismatches:",
        "",
        "@koloda/app (libs/app/package.json)",
        "  missing:  @koloda/ai",
        "    libs/app/src/lib/settings.ts:1:40 (import) @koloda/ai",
        "  phantom:  @koloda/srs",
        '  version:  @koloda/ui is "*" (expected "workspace:*")',
        "  unresolvable: libs/app/src/lib/load.ts:4:16 (dynamic-import) non-literal module specifier; workspace imports must use a literal specifier",
        "",
      ].join("\n"),
    );
  });
});
