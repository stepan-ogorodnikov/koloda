# Architectural Decisions

How to record cross-cutting architecture rulings that cannot live next to one piece of code.

This replaces classical ADRs (numbered, append-only, never deleted).
Decisions here are **current law**, the same way functional specs are living product truth.
Git history is the archive.

## What belongs here

A decision doc is warranted only when **both** hold:

1. The ruling spans **two or more** packages, layers, or language boundaries.
   An agent that only opens one of those homes would otherwise miss it.
2. No single code comment, package README, or functional spec can be the one home.

Examples that belong:

- Both TypeScript and Rust must mirror the same domain shape.
- Two platforms own persistence differently on purpose.
- A layer boundary agents keep trying to "clean up."

## What does not belong here

| Kind | Home instead |
| --- | --- |
| Local trap, intentional weirdness, library quirk | Tagged comment on the call site (`// WHY:`, `// INVARIANT:`, `// WORKAROUND:`) |
| Package ownership ("owns" / "does not own") | That package's README |
| User-visible behavior | Functional spec under `docs/specs/` |
| One-off task intent or open questions | The task file |
| Historical narrative ("we tried X in 2024") | Git history — do not keep a live doc for it |

If you are about to write a decision that only one file needs to obey, put a tagged comment there instead.

## Rules

**Living document.**
Update the decision in the same change that changes the architecture.
A decision that disagrees with the code is worse than no decision.

**Existence means active.**
If the file is in the tree, its Ruling still constrains work.
Do not keep `deprecated`, `superseded`, or `archive/` copies in the live tree.
When the ruling no longer applies, delete the file (or rewrite it into the new ruling) and remove every INDEX / review / playbook pointer to it in that same change.

**Topic filename, not a serial number.**
Name the file after the decision: `TS-RUST-DOMAIN-MIRRORING.md`, not `0001-…`.
Stable identity is the topic name, same as specs.

**Ruling over diary.**
State what must and must not stay true **now**.
A short Why is enough.
Do not write Context / Decision / Consequences essays unless the tradeoff is still contested.
Drop Rejected alternatives once the debate is settled.

**One home per ruling.**
Do not restate the same architecture rule in multiple decision files.
Point at the topic file from INDEX and playbooks.

**Hard to create, easy to delete.**
Prefer fewer decision docs.
Default to tagged comments and package READMEs.
Create a decision only when an agent editing the other layer would otherwise miss the force.

## Location

`docs/decisions/<TOPIC>.md`

Route from `agents/INDEX.md` by topic (when the change type needs it), never by number.

## Template

```markdown
# <Short title>

## Ruling

- <must / must-not bullets — normative force only>

## Why

<One short paragraph: why this over the obvious alternative. Not a history.>

## Applies when

- <change types / packages / INDEX rows that must load this file>
- <what does *not* need this file>

## Rejected alternatives

<!-- Optional. Only while the tradeoff is still contested. Delete this section once settled. -->

- <alternative> — rejected because <one line>
```

Omit Rejected alternatives when there is nothing live to argue.

## Checklist

- [ ] Spans more than one layer/package **and** cannot live in one comment or README
- [ ] Filename is the topic (no serial prefix)
- [ ] Ruling is present-tense law, not a changelog
- [ ] Why is short; no immortal Context essay
- [ ] INDEX (or the relevant playbook) points at this topic when needed
- [ ] No deprecated/superseded sibling left in the tree
- [ ] Same change updates or deletes this file when the architecture changes
