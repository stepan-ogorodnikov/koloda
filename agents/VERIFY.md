# Verification Guide for AI Agents

This guide defines how an agent proves a change without driving the running app.
Machine checks stay on unit and integration tests.
User-facing behavior is verified by the human from a short brief the agent writes.

Playwright suites (`apps/web-e2e`, `apps/electron-e2e`) are CI and human tools.
Do not treat them as the agent's proof loop.

## Split of ownership

| Layer | Who runs it | Home |
| --- | --- | --- |
| Domain, twin rules, persistence, async coordination | Agent | `agents/TESTING.md` |
| User-visible flows in the real UI | Human | Manual verify brief in this guide |

## Agents must not

- Start `apps/web`, the Electron shell, or any long-lived app process.
- Run `nx run web-e2e:e2e`, `nx run electron-e2e:e2e`, or a filtered Playwright spec.
  The only exception is a human who explicitly asked for that command in this session.
- Claim the UI works because unit tests passed.
- Ask the human to "test the assistant" or "check settings" without concrete paths.

## Agents must

1. Run the scoped unit or integration commands from `agents/TESTING.md` for the packages the change touched.
2. End the session, or the Plan item, with a **Manual verify** block when the change alters user-visible behavior.
3. When the change is pure wiring, barrel exports, or non-UI internals, do not invent clicks.
   Write `Manual verify: none — <one-line why>`.

## Manual verify block

Put it in the task close-out, the Plan item notes, or the message that hands work back to the human.
Keep it short: usually 3–7 paths, never a tour of the product.

```markdown
## Manual verify
- Host: web (add desktop only if this diff touched Electron, IPC, or desktop persistence)
- Paths:
  - <route or entry> → <action> → <what you should see>
  - <one negative or cancel path when the change adds a guard>
- Skip if: <when a listed path does not apply after this diff>
```

### How to write each path

- Start from a reachable UI state (named route, deck, conversation), not from an internal function.
- Name the action the human takes (click, key, submit), not the store method.
- Name the observable result (copy, list row, disabled control, restored messages).
- Prefer paths that would fail if the bug were real.
- Cite the owning spec section when it helps disambiguate (`docs/specs/….md` (§…)).

### Hosts

- Default to **web only**.
- Add a **desktop** path only when the diff touched desktop code.
  That is `apps/electron`, `apps/electron-react`, desktop IPC, or desktop-owned persistence.
- Do not duplicate the same path on both hosts for parity unless the change is host-specific.

## When VERIFY is in the prompt

Include this file when:

- The task's Intent or Done when is user-visible, or
- The Plan item's Done when includes manual steps, or
- The human asked how to verify the change.

Do not include it for pure domain or schema work that has no UI surface.
`agents/TESTING.md` is enough there.

## Relationship to other guides

- `agents/TESTING.md` — what automated tests to write and which commands to run.
- `agents/TASKS.md` — Plan `Done when` may point at test commands and at this Manual verify block.
- `apps/web-e2e/README.md`, `apps/electron-e2e/README.md` — how humans or CI run Playwright.
  That is not agent procedure.

## Checklist

- [ ] No app or Playwright process started unless the human asked for that command
- [ ] Scoped unit/integration commands run for touched packages
- [ ] User-visible change → Manual verify with concrete paths, or an explicit none
- [ ] Paths are actions and observables, not module names
- [ ] Desktop listed only when the diff needs it
