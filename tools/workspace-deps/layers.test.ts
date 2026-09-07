import { describe, expect, it } from "vitest";
import {
  PACKAGE_LAYERS,
  FEATURE_PEERS,
  EXCLUSIVE_CONSUMERS,
  LAYER_TABLE_PATH,
  buildLayerMap,
  classifyPackage,
  compareDirection,
  forbiddenImportReason,
  staleLayerEntries,
} from "./layers.ts";
import type { Layer, PackageKind } from "./layers.ts";

const APPS = [
  "@koloda/web",
  "@koloda/electron",
  "@koloda/electron-react",
  "@koloda/web-e2e",
  "@koloda/electron-e2e",
] as const;

function workspaceLayers(extra: { name: string; kind: PackageKind }[] = []) {
  return buildLayerMap([
    ...Object.keys(PACKAGE_LAYERS).map((name) => ({ name, kind: "lib" as const })),
    ...APPS.map((name) => ({ name, kind: "app" as const })),
    ...extra,
  ]);
}

describe("classifyPackage", () => {
  it("classifies listed libs and treats apps as composition roots", () => {
    expect(classifyPackage("@koloda/srs-react", "lib")).toBe("feature");
    expect(classifyPackage("@koloda/web", "app")).toBe("app");
    expect(classifyPackage("@koloda/mystery", "lib")).toBeNull();
    expect(classifyPackage("@koloda/new-host", "app")).toBe("app");
  });
});

describe("policy table", () => {
  it("lists every feature peer as a feature-layer package", () => {
    for (const [from, peers] of Object.entries(FEATURE_PEERS)) {
      expect(PACKAGE_LAYERS[from]).toBe("feature");
      for (const peer of peers) {
        expect(PACKAGE_LAYERS[peer]).toBe("feature");
      }
    }
  });

  it("lists exclusive packages in the layer table", () => {
    for (const name of Object.keys(EXCLUSIVE_CONSUMERS)) {
      expect(PACKAGE_LAYERS[name]).toBeDefined();
    }
  });
});

describe("forbiddenImportReason", () => {
  const layers = workspaceLayers();

  it("allows the current feature peers and domain edges", () => {
    expect(forbiddenImportReason("@koloda/settings", "@koloda/ai", layers)).toBeNull();
    expect(forbiddenImportReason("@koloda/ui", "@koloda/core-react", layers)).toBeNull();
    expect(forbiddenImportReason("@koloda/ui", "@koloda/app", layers)).toBeNull();
    expect(forbiddenImportReason("@koloda/assistant-react", "@koloda/ai-react", layers)).toBeNull();
    expect(forbiddenImportReason("@koloda/settings-react", "@koloda/srs-react", layers)).toBeNull();
    expect(forbiddenImportReason("@koloda/app-react", "@koloda/settings-react", layers)).toBeNull();
    expect(forbiddenImportReason("@koloda/web", "@koloda/db-pglite", layers)).toBeNull();
    expect(forbiddenImportReason("@koloda/electron", "@koloda/native-ipc", layers)).toBeNull();
    expect(forbiddenImportReason("@koloda/web-e2e", "@koloda/e2e", layers)).toBeNull();
    expect(forbiddenImportReason("@koloda/web", "@koloda/app-react", layers)).toBeNull();
  });

  it("rejects upward and cross-feature imports", () => {
    expect(forbiddenImportReason("@koloda/app", "@koloda/ui", layers)).toBe("domain cannot import ui (@koloda/ui)");
    expect(forbiddenImportReason("@koloda/ui", "@koloda/srs-react", layers)).toBe(
      "ui cannot import feature (@koloda/srs-react)",
    );
    expect(forbiddenImportReason("@koloda/core-react", "@koloda/ui", layers)).toBe(
      "data cannot import ui (@koloda/ui)",
    );
    expect(forbiddenImportReason("@koloda/srs-react", "@koloda/ai-react", layers)).toBe(
      "@koloda/ai-react is not a listed feature peer of @koloda/srs-react",
    );
    expect(forbiddenImportReason("@koloda/assistant-react", "@koloda/settings-react", layers)).toBe(
      "@koloda/settings-react is not a listed feature peer of @koloda/assistant-react",
    );
    expect(forbiddenImportReason("@koloda/assistant-react", "@koloda/app-react", layers)).toBe(
      "feature cannot import shell (@koloda/app-react)",
    );
    expect(forbiddenImportReason("@koloda/e2e", "@koloda/app", layers)).toBe("e2e cannot import domain (@koloda/app)");
    expect(forbiddenImportReason("@koloda/ui", "@koloda/web", layers)).toBe("ui cannot import app (@koloda/web)");
  });

  it("rejects exclusive packages from everyone except the listed consumers", () => {
    expect(forbiddenImportReason("@koloda/srs-react", "@koloda/db-pglite", layers)).toBe(
      "@koloda/db-pglite is exclusive to @koloda/web",
    );
    expect(forbiddenImportReason("@koloda/app-react", "@koloda/db-pglite", layers)).toBe(
      "@koloda/db-pglite is exclusive to @koloda/web",
    );
    expect(forbiddenImportReason("@koloda/web", "@koloda/native-ipc", layers)).toBe(
      "@koloda/native-ipc is exclusive to @koloda/electron, @koloda/electron-react",
    );
    expect(forbiddenImportReason("@koloda/electron-react", "@koloda/e2e", layers)).toBe(
      "@koloda/e2e is exclusive to @koloda/web-e2e, @koloda/electron-e2e",
    );
  });

  it("ignores unknown workspace names and self-imports", () => {
    expect(forbiddenImportReason("@koloda/app", "@koloda/app", layers)).toBeNull();
    expect(forbiddenImportReason("@koloda/srs-react", "@koloda/does-not-exist", layers)).toBeNull();
  });

  it("flags imports of discovered but unclassified libs", () => {
    const withMystery = workspaceLayers([{ name: "@koloda/mystery", kind: "lib" }]);
    expect(forbiddenImportReason("@koloda/srs-react", "@koloda/mystery", withMystery)).toBe(
      `@koloda/mystery is not classified in ${LAYER_TABLE_PATH}`,
    );
  });
});

describe("compareDirection", () => {
  it("marks unclassified libs and collects forbidden imports", () => {
    const layers = workspaceLayers([{ name: "@koloda/mystery", kind: "lib" }]);
    expect(
      compareDirection({
        selfName: "@koloda/mystery",
        imported: ["@koloda/app", "@koloda/db-pglite"],
        layers,
      }),
    ).toEqual({
      isUnclassified: true,
      forbidden: [{ dependency: "@koloda/db-pglite", reason: "@koloda/db-pglite is exclusive to @koloda/web" }],
    });

    expect(
      compareDirection({
        selfName: "@koloda/srs-react",
        imported: ["@koloda/app", "@koloda/ui", "@koloda/ai-react"],
        layers,
      }),
    ).toEqual({
      isUnclassified: false,
      forbidden: [
        {
          dependency: "@koloda/ai-react",
          reason: "@koloda/ai-react is not a listed feature peer of @koloda/srs-react",
        },
      ],
    });
  });

  it("does not treat apps as unclassified", () => {
    const layers = workspaceLayers();
    expect(
      compareDirection({
        selfName: "@koloda/web",
        imported: ["@koloda/app-react", "@koloda/db-pglite"],
        layers,
      }),
    ).toEqual({ isUnclassified: false, forbidden: [] });
  });
});

describe("staleLayerEntries", () => {
  it("reports layer-table packages that were not discovered", () => {
    expect(staleLayerEntries(["@koloda/app", "@koloda/ui"])).toContain("@koloda/srs");
    expect(staleLayerEntries(Object.keys(PACKAGE_LAYERS))).toEqual([]);
  });
});

describe("buildLayerMap", () => {
  it("stores null for unclassified libs", () => {
    const map = buildLayerMap([
      { name: "@koloda/app", kind: "lib" },
      { name: "@koloda/mystery", kind: "lib" },
      { name: "@koloda/web", kind: "app" },
    ]);
    expect(map.get("@koloda/app")).toBe("domain" satisfies Layer);
    expect(map.get("@koloda/mystery")).toBeNull();
    expect(map.get("@koloda/web")).toBe("app");
  });
});
