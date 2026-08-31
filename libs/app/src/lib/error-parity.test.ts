import { describe, expect, it } from "vitest";
import { ERROR_MESSAGES } from "./error";

// INVARIANT: TS↔Rust twin (agents/TESTING.md) — every `error_codes` string in
// `crates/koloda-core/src/app/error.rs` must have a matching key in
// `ERROR_MESSAGES` (`libs/app/src/lib/error.ts`). TS-only `ai.*` keys are
// allow-listed below; they are produced client-side, not by koloda-core.
//
// When adding a Rust error code:
// 1. Add `pub const …` to `error_codes` in `crates/koloda-core/src/app/error.rs`
// 2. Add the same string key to `ERROR_MESSAGES` in `libs/app/src/lib/error.ts`
// 3. Append the string to `RUST_ERROR_CODES` below (keep grouped like error.rs)
const RUST_ERROR_CODES = [
  "unknown",
  "db.get",
  "db.add",
  "db.update",
  "db.delete",
  "db.clone",
  "not-found.algorithms.clone.source",
  "not-found.algorithms.update.algorithm",
  "not-found.algorithms.delete.successor",
  "not-found.templates.clone.source",
  "not-found.templates.update.template",
  "not-found.cards.add.deck",
  "not-found.cards.add.template",
  "not-found.cards.update.card",
  "not-found.cards.reset.card",
  "not-found.cards.update.template",
  "not-found.decks.add.algorithm",
  "not-found.decks.add.template",
  "not-found.decks.update.deck",
  "not-found.decks.update.algorithm",
  "not-found.decks.update.template",
  "not-found.ai-profile",
  "validation.common.title.too-short",
  "validation.common.title.too-long",
  "validation.settings-learning.daily-limits.untouched-exceeds-total",
  "validation.settings-learning.daily-limits.learn-exceeds-total",
  "validation.settings-learning.daily-limits.review-exceeds-total",
  "validation.settings-learning.learn-ahead-limit.hours-range",
  "validation.settings-learning.learn-ahead-limit.minutes-range",
  "validation.settings-learning.day-starts-at",
  "validation.settings-hotkeys.duplicate-keys",
  "validation.settings-interface.language",
  "validation.settings-interface.scheme",
  "validation.settings-interface.light-theme",
  "validation.settings-interface.dark-theme",
  "validation.settings-interface.motion",
  "validation.algorithm.fsrs.retention",
  "validation.algorithm.fsrs.learning-steps.amount",
  "validation.algorithm.fsrs.learning-steps.unit",
  "validation.algorithm.fsrs.relearning-steps.amount",
  "validation.algorithm.fsrs.relearning-steps.unit",
  "validation.algorithm.fsrs.maximum-interval",
  "validation.algorithm.fsrs.weights",
  "validation.templates.fields.too-few",
  "validation.templates.layout.too-few",
  "validation.templates.update-locked",
  "validation.templates.delete-locked",
  "validation.cards.content.field-empty",
  "validation.reviews.rating",
  "validation.reviews.state",
  "validation.reviews.stability",
  "validation.reviews.difficulty",
  "validation.reviews.scheduled-days",
  "validation.reviews.learning-steps",
  "validation.reviews.time",
  "validation.cards-progress.state",
  "validation.cards-progress.stability",
  "validation.cards-progress.difficulty",
  "validation.cards-progress.scheduled-days",
  "validation.cards-progress.learning-steps",
  "validation.cards-progress.reps",
  "validation.cards-progress.lapses",
  "validation.settings-ai.providers.id",
  "validation.settings-ai.providers.apiKey",
  "validation.settings-ai.providers.baseUrl",
  "validation.settings-ai.profiles.whitelist-model-ids",
  "validation.ai-providers.profile-id.duplicate",
  "validation.assistant-settings.temperature-range",
  "validation.lessons.result.card-review-mismatch",
  "validation.lessons.amounts.negative",
  "validation.seed.learning-settings",
  "keyring",
  "secret-store",
  "windows-credentials",
] as const;

const TS_ONLY_ERROR_CODES = [
  "ai.http",
  "ai.network",
  "ai.invalid-response",
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

describe("ERROR_MESSAGES parity", () => {
  it("contains every pinned Rust error code", () => {
    for (const code of RUST_ERROR_CODES) {
      expect(ERROR_MESSAGES).toHaveProperty(code);
    }
  });

  it("keys match pinned Rust codes plus TS-only ai.* codes", () => {
    expect(Object.keys(ERROR_MESSAGES).sort()).toEqual([...RUST_ERROR_CODES, ...TS_ONLY_ERROR_CODES].sort());
  });
});
