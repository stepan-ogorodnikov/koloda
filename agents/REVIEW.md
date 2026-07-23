# Review Guide for AI Agents

This guide defines how LLM reviewers review diffs in this repository.
It is not an authoring guide.
The authoring guides are `agents/CODE-STYLE.md`, `agents/CSS.md`, `agents/CODE-DOCUMENTATION.md`, and the playbooks.

Always read this file plus `agents/CODE-STYLE.md`, `agents/CSS.md`, and `agents/CODE-DOCUMENTATION.md` for any review, even if the prompt did not list them.
These three define the standing rules you enforce — for example, missing `// WHY` / `// INVARIANT` / `// WORKAROUND` on non-obvious code is a Blocking finding per `agents/CODE-DOCUMENTATION.md`.
If you have not loaded them, you cannot raise Blocking findings that cite them.

The prompt additionally lists the task-specific specs, ADRs, and playbooks that apply to that diff.
Read those too. Do not load specs, ADRs, or playbooks the prompt did not list; those are task-scoped and loading unlisted ones causes whole-repo auditing noise.

## Scope

Comment only on changed lines and their immediate neighbors.
Never audit whole files.
Never comment on pre-existing code that the diff does not touch.

This single rule removes the majority of LLM review noise.

If pre-existing code outside the diff violates a rule, do not flag it as a required change.
At most, list it once under "Out of scope" at the end.

## Every comment cites a rule

Every finding must cite the rule it enforces.
Acceptable anchors:

- A guide file and section: `agents/CODE-STYLE.md` (Props Types), `agents/CSS.md` (Conditional styling).
- An ADR: `docs/adr/0001-TS-RUST-DOMAIN-MIRRORING.md`.
- A spec: `docs/specs/LESSONS.md` (Grading).
- A playbook row: `agents/ASSISTANT-CHAT-MAP.md` (Fix streaming).
- A package README boundary: `libs/srs-react/README.md` (Does NOT own).
- A lint rule from `.oxlintrc.json`.

Free-floating opinion is not a finding.
If you cannot point to an anchor, do not raise the comment.

## Severity tiers

Use exactly three tiers. No others.

### Blocking

The change is wrong or violates a project invariant.
It must be fixed before merge.

Raise Blocking for:

- Correctness errors, broken invariants, or behavior that contradicts a spec.
- Layer boundary violations: cite a row from `agents/ASSISTANT-CHAT-MAP.md` or a README "Does NOT own" line.
- TS ↔ Rust out of sync: provider enum, theme ids, schema, or any field that `docs/adr/0001` says both sides must agree on.
- Missing `// WHY` / `// INVARIANT` / `// WORKAROUND` on non-obvious code (see `agents/CODE-DOCUMENTATION.md`).
- Rules named in `agents/CODE-STYLE.md` or `agents/CSS.md` that are not lint-enforced. For example:
  - Boolean names missing a verb prefix.
  - Props type inlined in the function signature instead of a named `*Props` type.
  - A `tv()` recipe missing `defaultVariants` for a non-empty default.
  - A bare-adjective boolean variant instead of a verb-prefixed one.
  - A barrel that only forwards other modules (the compound component assignment is an exception, see below).
- A change that needs an ADR but does not include one (see `agents/CODE-DOCUMENTATION.md`, Comments vs ADRs).

### Nit (optional, never required)

Subjective taste that would not block merge on its own.
The author may take it or ignore it.

A nit may never be re-raised as Blocking if ignored.
Do not produce more nits than the diff length warrants.

### Out of scope (heads-up only)

Suspected issues outside the diff, or concerns the author should know about but need not act on now.
List them at the end as a short heads-up, not as action items.

## Project-specific noise: do not raise

These look like generic best-practice findings but are explicitly wrong for this repo.
Raising them wastes the human reviewer's time and signals the reviewer did not read the project guides.

- Do not request JSDoc or "document this function." See `agents/CODE-DOCUMENTATION.md`.
- Do not suggest deprecation shims, adapter layers, or compatibility wrappers. See `agents/BACKWARDS-COMPATIBILITY.md`.
- Do not propose collapsing the TS ↔ Rust duplication or unifying the two DB dialects. See `docs/adr/0001`, `docs/adr/0002`.
- Do not flag FSRS staying TypeScript-side as a bug, or suggest moving it into Rust. The source of truth is TS. See `docs/adr/0001`.
- Do not flag provider HTTP calls living in `libs/ai` instead of the store. Layer boundaries own this. See `agents/ASSISTANT-CHAT-MAP.md`.
- Do not flag `Select.Root = SelectRoot` style assignment as a reexport. It is the allowed compound component exception. See `agents/CODE-STYLE.md`.
- Do not request i18n for theme labels. Labels are plain strings in the theme registries. See `agents/ADD-COLOR-THEME.md`.
- Do not propose a "cleaner" code shape that contradicts a spec. Specs are the source of truth. If code and spec disagree, raise the discrepancy as Blocking and stop.
- Do not suggest adding optional parameters or future-proofing branches. See Change Discipline in `agents/CODE-STYLE.md`.
- Do not propose renaming or reformatting adjacent code the task did not touch. See Change Discipline in `agents/CODE-STYLE.md`.

## How to write a comment

One finding per comment.
Lead with the tier in brackets: `[Blocking]`, `[Nit]`, or `[Out of scope]`.
Then the location.
Then the rule citation.
Then the problem and the fix in two sentences at most.

Example:

```
[Blocking] select.tsx:24 — agents/CSS.md (Conditional styling, defaultVariants).
The `tableHeadCellContent` recipe has a non-empty default for `isSortable` but no `defaultVariants`.
Callers omitting `isSortable` get an undefined slot. Add `defaultVariants: { isSortable: false }`.
```

Do not explain what the code does in the comment.
Do not speculate about author intent.
Do not restate the diff.

## Checklist

- [ ] Every comment has a tier tag and a rule citation.
- [ ] No comments on pre-existing code outside the diff.
- [ ] No items from the noise list were raised.
- [ ] Blocking findings are actionable in this diff, not in a future refactor.
- [ ] Nits are clearly optional and outnumbered by Blocking findings or zero.
- [ ] No JSDoc requests, no deprecation shims, no cross-language unification proposals.