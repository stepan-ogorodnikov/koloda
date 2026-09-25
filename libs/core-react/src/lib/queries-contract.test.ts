import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { getQueriesContractIssues, QUERIES_METHODS } from "./queries-contract";

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");

function extractAdapterMethods(relativePath: string): string[] {
  const source = readFileSync(resolve(workspaceRoot, relativePath), "utf8");
  const methods = [...source.matchAll(/^\s{2}([A-Za-z][A-Za-z0-9]*(?:Query|Mutation))\s*:/gm)].map((match) => match[1]);
  return [...new Set(methods)].sort();
}

describe("Queries contract", () => {
  it("rejects missing, unexpected, and non-function entries", () => {
    const { getSettingsQuery: _, ...withoutSettings } = Object.fromEntries(
      QUERIES_METHODS.map((method) => [method, () => undefined]),
    );

    expect(getQueriesContractIssues(withoutSettings)).toContain("missing: getSettingsQuery");
    expect(getQueriesContractIssues({ ...withoutSettings, getSettingsQuery: "nope" })).toContain(
      "not a function: getSettingsQuery",
    );
    expect(
      getQueriesContractIssues({
        ...Object.fromEntries(QUERIES_METHODS.map((method) => [method, () => undefined])),
        extraMethod: () => undefined,
      }),
    ).toContain("unexpected: extraMethod");
  });

  it("keeps web and electron adapters aligned with QUERIES_METHODS", () => {
    const expected = [...QUERIES_METHODS].sort();
    const web = extractAdapterMethods("apps/web/src/app/queries.ts");
    const electron = extractAdapterMethods("apps/electron-react/src/app/queries.ts");

    expect(web).toEqual(expected);
    expect(electron).toEqual(expected);
  });
});
