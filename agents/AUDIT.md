# Audit Guide for AI Agents

This guide defines how an agent audits an area or a cross-cutting concern of this repository.
An audit is a read-only analysis.
Its output is a report, not code changes.
Its job is to find issues and tech debt that accumulated across many agent-written diffs.

It is not a diff review.
`agents/REVIEW.md` judges a change against the rules; an audit judges the code as it stands.
The review scope rule (changed lines only) does not apply — commenting on pre-existing code is the point.

## Target and inputs

The prompt names the target.
It is one of: one primary spec, one package, or one named cross-cutting concern.
Examples of a concern: dead code, mirror desync, test coverage.
If the target spans more than one primary spec without a single cross-cutting question, ask to split before analyzing.
If you cannot restate the include/exclude in a short paragraph, the target is too big — split it.

Always load these, even if the prompt omitted them:

- `agents/CODE-STYLE.md`
- `agents/CODE-DOCUMENTATION.md`
- `agents/TESTING.md`
- `agents/BACKWARDS-COMPATIBILITY.md`

Also load, when the target needs them:

- `agents/CSS.md` — UI / `className`
- `agents/I18N.md` — user-visible strings
- `agents/FUNCTIONAL-SPECIFICATIONS.md` — any spec is in the audited surface
- `agents/ASSISTANT-MAP.md` — assistant
- `docs/adr/0001-TS-RUST-DOMAIN-MIRRORING.md` — the target crosses TypeScript and Rust
- `docs/adr/0002-DUAL-PLATFORM-PERSISTENCE.md` — the target includes persistence
- `apps/native-electron/IPC.md` — desktop IPC
- the playbook for a half-finished recipe:
  `agents/ADD-AI-PROVIDER.md`, `agents/ADD-HOTKEY.md`, `agents/ADD-COLOR-THEME.md`, `agents/DB.md`

The prompt lists the owning spec and area guides.
If those are missing, ask for them before starting.
Do not load specs the target does not need.
If you have not loaded a spec, you cannot raise a spec-violation finding against it.

Read the README of each package in scope (`Where it sits`, `Does NOT own`).
Read the owning specs before the code.
Code is judged against its spec, not against taste.
The tests are part of the audited surface.

## Method

1. Restate the scope before analyzing: the packages, specs, ADRs, and test commands included, and what is out.
2. Read specs, then code, then tests.
3. Check conformance in both directions: code against spec, and spec against code.
4. Hunt for desync across mirrors, not for a way to collapse them.
5. Verify every finding by reading the cited lines.
6. Verify dead-code and "no callers" claims by searching current callers first.
   Cite the search (pattern and path), not only `file:line`.
7. When the audit questions correctness or coverage, run the named command for that target, not the whole monorepo:
   - TypeScript libs: `bun run test:libs`
   - Rust: `cargo test`
   - Desktop unit: `nx run native-electron:test:unit`
   - Desktop e2e: `nx run native-electron:test:e2e`
   - Web e2e: `nx run demo-e2e:e2e`
   Record which command ran.

A pattern-matched finding is not a finding.
If you cannot point at the lines, drop it.

## What to look for

Generic quality, when you can cite lines:

- Correctness — races, broken invariants, spec violations in either direction.
- Spec drift — rules held only by UI convention, or behavior the spec does not describe.
- Performance — hot paths, per-request costs, re-render amplification, unbounded growth.
- Architecture — god files, boundary drift, hidden coupling, invariants held by discipline alone.
- Dead code and leftover surface — verified against current callers.
- Duplication — copies that have already drifted or plausibly will.
- UX and product gaps — spec-level decisions, reported as product decisions, not bugs.
- Testing — missing scenarios, not coverage percentages.

Project residue from agentic coding.
This list is the point of the audit:

- Mirror desync — Zod / TS domain vs Rust domain disagree (`docs/adr/0001`).
- Dialect desync — PGlite vs SQLite / Refinery columns or behavior disagree (`docs/adr/0002`, `agents/DB.md`).
- IPC drift — `apps/native-electron/IPC.md` vs main or renderer.
- Layer leaks — a package does work that its README `Does NOT own`, or that `agents/ASSISTANT-MAP.md` forbids.
- Missing trap comments — non-obvious code without `// WHY` / `// INVARIANT` / `// WORKAROUND`.
- Leftover shims — deprecated wrappers, adapters, unused exports (`agents/BACKWARDS-COMPATIBILITY.md`).
- One-call-site helpers and future-proof optional params (`agents/CODE-STYLE.md`, Change Discipline).
- Half-finished playbooks — a recipe started and not carried through every listed layer.
- i18n orphans and missing keys (`agents/I18N.md`).
- Tests that mock until green — they would not fail if the behavior were wrong (`agents/TESTING.md`).
- Spec hygiene — restated invariants, an "Edge Cases" dump, code or persistence names in a spec
  (`agents/FUNCTIONAL-SPECIFICATIONS.md`).

The job is desync, not unification.
Flag the two sides disagreeing.
Do not recommend collapsing TypeScript and Rust, or the two DB engines.

## Finding rules

Every finding cites `file:line`.
Dead-code findings also cite the search.
Architecture findings cite the boundary they break.
Cite a README `Does NOT own` line, an `ASSISTANT-MAP.md` row, or an ADR section.
Spec-violation findings cite the spec section.

Every finding carries one classification:

- **Spec violation** — code contradicts its spec, or the spec contradicts the code.
- **Risk** — works today, fails under a foreseeable change or input.
- **Improvement** — a judgment call with a concrete payoff.
- **Product decision** — a deliberate spec position worth revisiting.
  Name it as such, not as a bug.

Every finding also carries one severity, independent of classification:

- **Must-fix** — wrong, or will fail under ordinary use.
- **Should-fix** — real debt with a bounded, local fix.
- **Later** — payoff is real but not worth a commit on its own.

An Improvement must not outrank a Must-fix Spec violation or Risk in the verdict or the recommendations table.

State the fix direction in one or two sentences.
The direction stays local: the cited lines, or the twin that must move with them.
Do not recommend rewriting a module.
If only a redesign would help, say so as Later or as a Product decision and stop.

An audit recommends; it does not implement.

A finding whose only basis is taste is not a finding.

## Noise: do not raise

These look like findings but are wrong for this repo.
The review noise list is not copied unchanged; the dropped item is the diff-scope rename rule.

- Do not request JSDoc or "document this function" for ordinary APIs.
  Module/type orientation docs are allowed per `agents/CODE-DOCUMENTATION.md`.
- Do not suggest adding deprecation shims, adapter layers, or compatibility wrappers.
  Existing leftovers of those are residue — flag them.
- Do not propose collapsing the TS ↔ Rust duplication or unifying the two DB dialects.
  See `docs/adr/0001`, `docs/adr/0002`.
  Desync between the two sides is a finding; unification is not the fix.
- Do not flag FSRS staying TypeScript-side as a bug, or suggest moving it into Rust.
  The source of truth is TS. See `docs/adr/0001`.
- Do not flag provider HTTP calls living in `libs/ai` instead of the store.
  See `agents/ASSISTANT-MAP.md`.
- Do not flag `Select.Root = SelectRoot` style assignment as a reexport.
  See `agents/CODE-STYLE.md`.
- Do not request i18n for theme labels.
  See `agents/ADD-COLOR-THEME.md`.
- Do not propose a "cleaner" code shape that contradicts a spec.
  If code and spec disagree, raise a Spec violation and stop.
- Do not demand a new spec, extra sibling specs, or an "Edge Cases" section.
  Cite `agents/FUNCTIONAL-SPECIFICATIONS.md`.
  An existing "Edge Cases" dump is spec-hygiene residue.
- Do not flag a pointer (`FILE.md (§Section)`) as missing detail.
  One home per rule is the point.
- Do not suggest adding optional parameters or future-proofing branches.
  Existing ones are residue — flag them.
- Do not flag anything lint already enforces.

Inconsistent naming across an area may be an Improvement when the payoff is concrete.
There is no "task" whose untouched neighbors are off limits.

## Report

Write the report to `tmp/audits/<slug>.md`, creating the directory if needed.
The slug names the target, for example `assistant-messages` or `core-dead-code`.
`tmp/` is gitignored; the report is ephemeral.
Accepted work becomes a task file later, per `agents/TASKS.md` and `agents/IMPLEMENTATION-PLAN.md`.
The audit session does not create that file and does not implement.

Structure, in this order:

1. Title and date.
2. Scope reviewed — the specs, packages, ADRs, and rough size actually read, plus test commands run.
3. Verdict — the TL;DR: overall health plus the few Must-fix and Should-fix findings that matter most.
4. Strengths — what is good and should be kept as-is.
5. Findings grouped by classification, ordered by severity inside each group.
   Each finding has `file:line` evidence, a classification, a severity, and a local fix direction.
6. Prioritized recommendations — a table: number, action (with § references), severity, effort, impact.

The verdict is required.
An audit that is only a complaint list is a bad audit; the strengths section is not decoration.
Each recommendation must be written so it can become a plan item without rework.

## After the report

Deliver the report and stop.
Do not fix findings in the audit session.

The human triages each finding: fix, skip, or needs-decision.

## Checklist

- [ ] Scope restated and bounded; split asked for if the target spanned more than one primary spec.
- [ ] Standing guides loaded; specs read before code.
- [ ] Every finding cites `file:line`, a classification, and a severity.
- [ ] Spec-violation findings cite the spec section.
- [ ] Architecture findings cite a README, map row, or ADR.
- [ ] Dead-code claims cite the search used.
- [ ] Desync flagged; unification not recommended.
- [ ] Fix directions are local; no module rewrite.
- [ ] No noise-list items raised; no taste-only findings.
- [ ] Named test command run when correctness or coverage was in question.
- [ ] Verdict, strengths, and prioritized recommendations present.
- [ ] No code changed; report written to `tmp/audits/<slug>.md`.
