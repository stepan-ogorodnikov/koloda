import { describe, expect, it } from "vitest";
import { AI_PROVIDERS } from "./provider-catalog";
import { AI_PROVIDER_REGISTRY } from "./provider-registry";

// INVARIANT: TS↔Rust twin (agents/TESTING.md) — these ids must stay in sync
// with the `AISecrets` serde provider tags in
// `crates/koloda/src/domain/ai.rs`, pinned by
// `ai_secrets_provider_tags_match_ts_registry` in
// `crates/koloda/tests/domain/ai_tests.rs`. Adding a provider requires
// touching both pins (agents/ADD-AI-PROVIDER.md).
const RUST_AI_SECRETS_PROVIDER_TAGS = ["openrouter", "ollama", "lmstudio", "opencodeGo", "opencodeZen", "ollamaCloud"];

describe("AI provider registry parity", () => {
  it("registry keys match the pinned Rust AISecrets provider tags", () => {
    expect(Object.keys(AI_PROVIDER_REGISTRY).sort()).toEqual([...RUST_AI_SECRETS_PROVIDER_TAGS].sort());
  });

  it("catalog covers exactly the registry ids", () => {
    expect([...AI_PROVIDERS].sort()).toEqual([...RUST_AI_SECRETS_PROVIDER_TAGS].sort());
  });
});
