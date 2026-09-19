# Unlimited daily limits

Status: draft

## Intent

Daily limits for Total, New, Learn, and Review can be unlimited or a non-negative cap.
Zero is a hard cap: no remaining room for that limit.
Unlimited is an explicit choice, not a hidden meaning of zero.

Done when the user can turn Unlimited on or off for each of the four limits in learning settings, save, and see infinity where an unlimited cap is shown.
A saved zero still means none of that type for the day.
Existing settings that stored Total as zero keep unlimited Total.

## Scope

In:

- Learning settings daily-limit meaning, validation, and the settings form.
- How remaining room and over-limit flags treat unlimited vs zero vs a positive cap.
- Lesson init defaults and today's-progress display of those caps.
- Spec for Daily Limits, and the LESSONS.md pointers into that section.

Out:

- Changing default numbers (Total 200, New 50, Learn 0 not counted, Review 200).
- Learn-ahead, day-starts-at, or algorithm/template defaults.
- Hard-blocking study when a limit is reached; limits still only shape init defaults.
- Changing shared NumberField empty-blur behavior.

## Open questions

- [x] How is unlimited stored? — `null` on Total and on each per-type `value`; not `-1` and not a second flag
- [x] What does zero mean? — hard cap on every limit, including Total
- [x] Existing Total `0` in saved settings? — coerce to `null` on input parse only; do not coerce per-type `0`
- [x] Default Learn `0`? — keep as a hard zero that does not count toward Total

## Plan

- [ ] 1. Describe unlimited daily limits in the spec
  Goal: Rewrite `docs/specs/LEARNING-SETTINGS.md` §Daily Limits so it matches the intended product, not the current Total-zero-as-uncapped rule.
  Each of Total, New, Learn, and Review can be unlimited or a non-negative number.
  Zero is a hard cap for that limit: no remaining room, and any cards of that type already studied today are over that type's limit.
  Unlimited Total does not cap counted types.
  A finite Total still forbids a counted per-type number larger than Total; saving that is rejected and previous settings are kept.
  When Total is zero, a counted per-type number must be zero.
  Unlimited New, Learn, or Review is allowed with a finite Total; Total still clamps counted remaining room at init.
  Counts toward total is unchanged and still applies when a type is unlimited.
  Where a cap is shown, unlimited appears as infinity.
  The user sets unlimited with an Unlimited control next to each limit; do not specify layout or chrome.
  Do not name `null`, JSON fields, or parsers.
  Point LESSONS.md §Today's Progress and §Default Amounts at this section for unlimited and for zero, not for zero only.
  Constraints: Spec-only.
  Do not change code or `agents/TESTING.md`.
  Read `docs/specs/LEARNING-SETTINGS.md`, `docs/specs/LESSONS.md`, `agents/FUNCTIONAL-SPECIFICATIONS.md`, `agents/MARKDOWN.md`.
  Done when: the spec states unlimited vs zero vs a positive cap for all four limits, the counted-vs-Total save rules, and the LESSONS.md pointers no longer say only "a limit of zero".
  Commit candidates:
  - Spell out unlimited vs a hard-zero daily cap
  - Replace Total-zero-as-uncapped in the learning-settings spec
  - Describe unlimited daily limits in LEARNING-SETTINGS
  Depends on: none

- [ ] 2. Encode unlimited as null and apply it in remaining room
  Goal: Make the stored and resolved daily-limit numbers `number | null` (Rust `Option<u32>`).
  `null` is unlimited.
  `0` is a hard cap, including Total.
  On input parse only, coerce a stored Total of `0` to `null` so existing unlimited Totals stay unlimited.
  Do not coerce per-type `0`.
  Do not coerce a resolved form value of Total `0` on save; after the input coerce has run, a user can persist Total `0`.
  Mirror the Zod defaulting schema and refines in `crates/koloda` `DailyLimits`.
  Skip the counted-exceeds-total refine when Total is `null`.
  When Total is `0`, reject a counted finite per-type value greater than `0`.
  Unlimited per-type with a finite Total is valid.
  Replace `total > 0`, `total || Infinity`, and `isUncappedWhenZero` with one remaining-room / over-limit rule in TS and Rust reviews and in lesson init defaults.
  Show infinity in learned-today and lesson-init progress when the cap is `null`, for every type, not only Total.
  Update `agents/TESTING.md` so the daily-limit example is "zero is a hard cap / null is no cap", not "zero total is no cap".
  Update Zod, Rust domain, reviews, lesson-reducer, and colocated tests in the same change.
  Constraints: Do not add Unlimited switches or new i18n strings.
  Do not change NumberField.
  Settings form and learning-settings e2e may not accept `null` yet.
  Green: no — restored by item 3.
  Read `docs/specs/LEARNING-SETTINGS.md`, `agents/TESTING.md`, `agents/RUST.md`, `docs/adr/0001-TS-RUST-DOMAIN-MIRRORING.md`, `agents/CODE-STYLE.md`, `agents/CODE-DOCUMENTATION.md`, `agents/BACKWARDS-COMPATIBILITY.md`.
  Done when: validation tests cover null Total, hard-zero Total, legacy Total `0` → null, and counted-exceeds-total.
  Review-totals and lesson-init tests treat null as uncapped and `0` as no remaining room on every limit type.
  Settings form compile/type errors may remain.
  Commit candidates:
  - Treat null daily limits as unlimited and zero as a hard cap
  - Stop using Total zero as the unlimited daily-limit sentinel
  - Mirror nullable daily limits in Zod and Rust
  Depends on: 1

- [ ] 3. Add Unlimited switches on the learning settings form
  Goal: Each of Total, New, Learn, and Review has an Unlimited switch beside its number field.
  On: the stored value is `null` and the number field is disabled or hidden.
  Off: restore the last number or `0`.
  Per-type rows keep Counts toward total.
  Do not change NumberField empty-blur (empty still snaps to min).
  Form validation uses `number | null`.
  Keep counted-exceeds-total e2e in web and electron.
  Add coverage that Unlimited Total allows a large counted cap, and that hard-zero Total rejects a counted value above zero.
  Constraints: No engine or spec changes unless a label the spec already named was missing.
  Mirror both e2e suites.
  Read `docs/specs/LEARNING-SETTINGS.md`, `agents/I18N.md`, `agents/CODE-STYLE.md`, `agents/CODE-DOCUMENTATION.md`, `agents/TESTING.md`, `agents/CSS.md`.
  Done when: the form can save unlimited and hard-zero for each limit, unit or form tests cover the switch, and both e2e suites pass the old and new validation cases.
  `bunx nx test settings-react` and the two learning-settings e2e specs pass.
  Commit candidates:
  - Add Unlimited switches to daily limit fields
  - Let learning settings save unlimited daily caps
  - Expose unlimited daily limits on the settings form
  Depends on: 2

## Outcome

<what shipped>
