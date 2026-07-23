# Agent Guide Index

Human-only routing table.
Do not paste this file into a prompt.
It exists so you can pick the minimal set of guides for a narrow task without bloating the model's context.

There is no `AGENTS.md` on purpose.
Include only the guides the task needs.
This file tells you which those are.

## How to use

Find your change type in the table.
Paste the listed guides into the prompt, plus the task description.
Nothing else.

The listed files are relative to the repo root.

## Authoring

| Change type | Include in the prompt |
| --- | --- |
| Any TS or React edit | `agents/CODE-STYLE.md`, `agents/CODE-DOCUMENTATION.md` |
| Edit touches `className` | add `agents/CSS.md` |
| Add an AI provider | `agents/ADD-AI-PROVIDER.md`, `agents/CODE-STYLE.md`, `agents/CODE-DOCUMENTATION.md`, `agents/I18N.md`, `docs/adr/0001-TS-RUST-DOMAIN-MIRRORING.md` |
| Assistant chat (anything) | `agents/ASSISTANT-CHAT-MAP.md` (it routes to the specs and files) |
| Database schema change | `agents/DB.md`, `docs/adr/0001-TS-RUST-DOMAIN-MIRRORING.md`, `docs/adr/0002-DUAL-PLATFORM-PERSISTENCE.md` |
| Add a color theme | `agents/ADD-COLOR-THEME.md` |
| Add a hotkey | `agents/ADD-HOTKEY.md`, `agents/I18N.md` |
| Write or update a functional spec | `agents/ADD-FUNCTIONAL-SPECIFICATION.md`, `agents/MARKDOWN.md` |
| Write or update an ADR (new area decision) | `docs/adr/README.md`, `agents/MARKDOWN.md` |
| Write or update any markdown | `agents/MARKDOWN.md` |

## Reviewing

Always include `agents/REVIEW.md`.
Then add the same guides the author used for that change type, so the reviewer applies the same rules.

| Review target | Add to `agents/REVIEW.md` |
| --- | --- |
| Any diff | `agents/CODE-STYLE.md`, `agents/CODE-DOCUMENTATION.md` |
| Diff touches `className` | add `agents/CSS.md` |
| Add AI provider diff | `agents/ADD-AI-PROVIDER.md`, `agents/I18N.md`, `docs/adr/0001-TS-RUST-DOMAIN-MIRRORING.md` |
| Assistant chat diff | `agents/ASSISTANT-CHAT-MAP.md` (+ the spec it names) |
| Schema change diff | `agents/DB.md`, `docs/adr/0001`, `docs/adr/0002` |
| Theme diff | `agents/ADD-COLOR-THEME.md` |
| Hotkey diff | `agents/ADD-HOTKEY.md`, `agents/I18N.md` |

## Always-available background

Do not paste these unless the task touches them.
Consult them yourself when a change crosses a boundary.

- `agents/BACKWARDS-COMPATIBILITY.md` — deletion policy, no shims.
- `docs/adr/0001-TS-RUST-DOMAIN-MIRRORING.md` — why TS and Rust both exist.
- `docs/adr/0002-DUAL-PLATFORM-PERSISTENCE.md` — why two DB engines exist.
- `libs/*/README.md` — per-package "Where it sits" and "Does NOT own" boundaries.

## Rule to remember

Minimal context is the goal.
If a guide is not relevant to the task, do not include it.
This index helps you omit, not pile on.