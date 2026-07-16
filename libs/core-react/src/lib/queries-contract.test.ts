import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { assertQueriesContract, getQueriesContractIssues, QUERIES_METHODS } from "./queries-contract";

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");

function extractAdapterMethods(relativePath: string): string[] {
  const source = readFileSync(resolve(workspaceRoot, relativePath), "utf8");
  const methods = [...source.matchAll(/^\s{2}([A-Za-z][A-Za-z0-9]*(?:Query|Mutation))\s*:/gm)].map((match) => match[1]);
  return [...new Set(methods)].sort();
}

describe("Queries contract", () => {
  it("lists each Queries method once", () => {
    expect(new Set(QUERIES_METHODS).size).toBe(QUERIES_METHODS.length);
  });

  it("accepts a complete adapter object", () => {
    const queries = Object.fromEntries(QUERIES_METHODS.map((method) => [method, () => undefined]));
    expect(getQueriesContractIssues(queries)).toEqual([]);
    expect(() => assertQueriesContract(queries)).not.toThrow();
  });

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

  it("keeps demo and electron adapters aligned with QUERIES_METHODS", () => {
    const expected = [...QUERIES_METHODS].sort();
    const demo = extractAdapterMethods("apps/demo/src/app/queries.ts");
    const electron = extractAdapterMethods("apps/native-electron-react/src/app/queries.ts");

    expect(demo).toEqual(expected);
    expect(electron).toEqual(expected);
  });
});
