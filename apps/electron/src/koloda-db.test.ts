import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// INVARIANT: koloda-db.ts is a hand-written mirror of the NAPI `KolodaDb`
// class (`src-rust/src/lib.rs`, JS names = camelCased method names) with no
// generated .d.ts behind it, so drift otherwise surfaces only at runtime as
// "db.getX is not a function". Both surfaces are parsed from source at test
// time (no pinned copy) — same pattern as libs/app error-parity.
//
// Deliberately unmirrored, main-only secrets (see koloda-db.ts INVARIANT).
// A new main-only method must be added here consciously.
const RUST_ONLY_METHODS = ["getAiProfileSecrets"] as const;

const RUST_LIB_RS = resolve(dirname(fileURLToPath(import.meta.url)), "../src-rust/src/lib.rs");
const MIRROR_TS = resolve(dirname(fileURLToPath(import.meta.url)), "koloda-db.ts");

function snakeToCamel(name: string) {
  return name.replace(/_([a-z0-9])/g, (_, char: string) => char.toUpperCase());
}

function rustNapiMethods(): string[] {
  const source = readFileSync(RUST_LIB_RS, "utf8");
  const start = source.indexOf("#[napi]\nimpl KolodaDb {");
  if (start === -1) throw new Error("impl KolodaDb block not found in lib.rs");
  const block = source.slice(start, source.indexOf("\n}\n", start));
  return [...block.matchAll(/pub fn (\w+)\(/g)]
    .map((match) => match[1])
    .filter((name) => name !== "new") // constructor
    .map(snakeToCamel);
}

function mirrorMethods(): string[] {
  const source = readFileSync(MIRROR_TS, "utf8");
  const start = source.indexOf("export interface KolodaDb {");
  if (start === -1) throw new Error("KolodaDb interface not found in koloda-db.ts");
  const block = source.slice(start, source.indexOf("\n}", start));
  return [...block.matchAll(/^ {2}(\w+)\(.*\): .+;$/gm)].map((match) => match[1]);
}

describe("KolodaDb NAPI mirror parity", () => {
  it("mirrors every NAPI method except the main-only allow-list", () => {
    const unmirrored = rustNapiMethods().filter((name) => !mirrorMethods().includes(name));
    expect([...unmirrored].sort()).toEqual([...RUST_ONLY_METHODS].sort());
  });

  it("declares only methods the NAPI class actually exposes", () => {
    const unknown = mirrorMethods().filter((name) => !rustNapiMethods().includes(name));
    expect(unknown).toEqual([]);
  });
});
