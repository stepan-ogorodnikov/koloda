import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ERROR_MESSAGES } from "./error";

// INVARIANT: TS↔Rust twin (agents/TESTING.md) — every `error_codes` string in
// `crates/koloda/src/app/error.rs` must have a matching key in
// `ERROR_MESSAGES` (`libs/app/src/lib/error.ts`). The Rust list is parsed from
// the source file at test time (no pinned copy), so a code added on the Rust
// side fails here until the message table catches up. TS-only `ai.*` keys are
// allow-listed below; they are produced client-side, not by koloda.
//
// When adding a Rust error code:
// 1. Add `pub const …` to `error_codes` in `crates/koloda/src/app/error.rs`
// 2. Add the same string key to `ERROR_MESSAGES` in `libs/app/src/lib/error.ts`
const TS_ONLY_ERROR_CODES = [
  "ai.http",
  "ai.network",
  "ai.invalid-response",
  "ai.aborted",
  "ai.http.400",
  "ai.http.401",
  "ai.http.402",
  "ai.http.403",
  "ai.http.404",
  "ai.http.408",
  "ai.http.413",
  "ai.http.422",
  "ai.http.429",
  "ai.http.500",
  "ai.http.502",
  "ai.http.503",
  "ai.http.504",
] as const;

const RUST_ERROR_RS = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../crates/koloda/src/app/error.rs");

function rustErrorCodes(): string[] {
  const source = readFileSync(RUST_ERROR_RS, "utf8");
  const start = source.indexOf("pub mod error_codes {");
  const mod = source.slice(start, source.indexOf("\n}", start));
  return [...mod.matchAll(/pub const [A-Z0-9_]+: &str =\s*"([^"]+)"/g)].map((match) => match[1]);
}

describe("ERROR_MESSAGES parity", () => {
  it("contains every Rust error code", () => {
    for (const code of rustErrorCodes()) {
      expect(ERROR_MESSAGES).toHaveProperty(code);
    }
  });

  it("keys match Rust codes plus TS-only ai.* codes", () => {
    expect(Object.keys(ERROR_MESSAGES).sort()).toEqual([...rustErrorCodes(), ...TS_ONLY_ERROR_CODES].sort());
  });
});
