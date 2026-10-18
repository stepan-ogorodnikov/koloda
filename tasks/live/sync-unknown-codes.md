# Ask for an app update when a sync reply can't be read

Status: ready
Guides: agents/IMPLEMENTATION-PLAN.md, agents/TASKS.md, crates/koloda-sync/README.md, crates/koloda-sync-proto/PROTOCOL.md, crates/koloda-sync-proto/README.md, apps/electron/README.md, apps/electron/IPC.md, docs/specs/SYNC.md, agents/FUNCTIONAL-SPECIFICATIONS.md, agents/I18N.md, agents/CODE-STYLE.md, agents/CODE-DOCUMENTATION.md, agents/TESTING.md, agents/BACKWARDS-COMPATIBILITY.md, agents/MARKDOWN.md, agents/VERIFY.md, agents/REVIEW.md
Flow: local

## Intent

An app that meets a newer sync server's reply it cannot read says the app needs an update.
Today it says the server can't be reached.

This is finding 16 of the audit of the sync wire protocol (`crates/koloda-sync-proto`) at `9c4b5fa8` (`main`).
Its report was `tmp/audits/sync-proto.md`, which git ignores.
`sync-proto-audit` left it for a decision, and the human decided it on 2026-10-18 while scheduling
`sync-proto-followups` (Open questions 1).
This file restates the evidence, checked again against `4fa1881b`, so neither of those files needs to be open.

Done when:

- a reply with an error code, a push outcome, or a held reason this app does not know stops sync with a message that
  asks for an app update, on Settings → Sync and in the title bar tooltip, in `en` and `ru`;
- a call such as a join or a preview that meets such a reply fails with the same advice;
- a push whose reply this app cannot read settles nothing, and its changes upload once the app is updated;
- a reply that is not a sync reply, such as a proxy's error page, still reads as a server out of reach;
- `PROTOCOL.md` says what an older app does with a reply it cannot read, and `SYNC.md` §When Sync Stops lists it;
- `bun run check:push` is green.

## Scope

Evidence; line numbers are at `4fa1881b`.

- `ErrorCode`, `Outcome`, `HeldReason`, and `DependencyAction` are closed enums with no catch-all
  (`crates/koloda-sync-proto/src/transport.rs:171-190`, `:331-357`).
  So are other reply values, such as `Platform` (`:192-200`) and `RestoreMode`.
  Every reply body also refuses unknown keys (§Bodies, `PROTOCOL.md:917`).
- A reply that does not decode as its `Reply<T>` fails in `decode` (`crates/koloda-sync/src/client.rs:198-216`) as
  "a … reply is not a sync reply".
  That is a `TransportError`, which the client retries like a lost reply (`client.rs:95-105`).
  It then becomes `SyncError::Transport`, which the status shows as `Stop::Unreachable`
  (`crates/koloda-sync/src/status.rs:86`), and the host calls as `sync.unreachable`
  (`apps/electron/src-rust/src/sync.rs:349`).
- So when a server adds an error code or an outcome, every older app says "The sync server can't be reached. Sync
  retries on its own." (`settings.sync.stop.unreachable`), retries forever, and never says to update.
- The protocol states a forward rule only for payload schemas and `koloda-schemas` (§Schema versions,
  `PROTOCOL.md:1794-1832`).
  §Errors (`:1000`) and §Push outcomes (`:1022`) say nothing about an older app.
- The pull side already has this rule: an envelope this app cannot read holds its lane as `update_required`, and
  Settings → Sync says to update the app (`settings.sync.hold.update-required`).
- The stop travels engine → addon → TS:
  - `Stop` (`status.rs:53-72`) and `Stop::of` (`:73-91`);
  - `StopWire` (`apps/electron/src-rust/src/sync.rs:442-470`) and its wire table test (`:574-600`);
  - `SyncStop` (`libs/app/src/lib/sync.ts:4-13`);
  - `useSyncStopMessage` (`libs/settings-react/src/lib/sync/sync-messages.ts:24-63`), which Settings → Sync, its
    problems list, the first-run join, and the title bar indicator use.
- Host-call errors travel as codes: `sync_error_codes` and `error_code` (`apps/electron/src-rust/src/sync.rs:34-50`,
  `:345-370`) and `ERROR_MESSAGES` (`libs/app/src/lib/error.ts:132-145`), held in step by `error-parity.test.ts`.
- `is_waiting` (`crates/koloda-sync/src/error.rs:82-92`) lists the errors after which the runner waits for a trigger,
  with no poll, no backoff, and no `Error` event.
- The engine's test transport injects any reply (`Fault::Reply`, as in
  `crates/koloda-sync/tests/engine/client_tests.rs:44-66`).

In:

- `koloda-sync`: reply decoding (`client.rs`), `SyncError`, `Stop`, and `is_waiting`.
- The desktop addon's stop wire and host error code (`apps/electron/src-rust/src/sync.rs`).
- `libs/app`: `SyncStop` and `ERROR_MESSAGES`; `libs/settings-react`: the stop message; both libs' `en` and `ru`
  catalogs.
- `PROTOCOL.md` §Bodies, §Errors, and §Push outcomes; `docs/specs/SYNC.md` §When Sync Stops;
  `apps/electron/IPC.md` §Sync if it lists the stop reasons or codes.

Out:

- The server: it keeps sending only what it sends.
- Events socket frames: one this app cannot read already closes the socket, which reconnects with a growing wait,
  while polling still syncs (Open questions 3).
- A request a newer app sends to an older server, which the server refuses as `bad_request` (§Bodies).

## Open questions

- [x] 1. Flow? — `local` (human, 2026-10-18).
- [x] 2. How does the app tell a reply it cannot read (decided on 2026-10-18: it reads as update required)? —
  any sync reply whose body does not decode; as proposed (human, 2026-10-18).
  When a reply fails to decode as `Reply<T>` but is a CBOR map with a `meta` key, it is a sync reply from a newer
  server.
  The engine fails the call with `SyncError::UpdateRequired`, not retried, which stops sync as `Stop::UpdateRequired`.
  That covers a new error code, outcome, held reason, or dependency action, and also a new key or a new value of any
  other reply enum, with one check in `client.rs`.
  `sync-proto-followups` item 2 (unknown keys in an outcome) then reads as update required too, and neither task waits
  for the other.
  Not proposed: an `Unknown` variant on each of the four enums.
  It covers only those four, puts an arm the server never sends into `koloda`'s settle code, and leaves every other
  new key or value reading as a server out of reach.
- [x] 3. Events frames: out, or the same rule? — out; as proposed (human, 2026-10-18).
  An unreadable frame ends the socket (`crates/koloda-sync/src/transport.rs:116-121`), and it reconnects with a
  growing wait; polling still syncs, and the next reply that changed stops sync as update required.
- [x] 4. Copy? — as proposed (human, 2026-10-18), in `en`:
  - the stop: "The sync server is newer than this version of the app. Update the app, and sync resumes."
  - a failed call: "The sync server is newer than this version of the app. Update the app, then try again."
  `ru` says the same; the implementer writes it and the human checks it.

## Plan

- [ ] 1. Ask for an app update when a sync reply can't be read
  Goal (per questions 2 and 4):
  - `decode` and `read` (`crates/koloda-sync/src/client.rs:121-216`): a reply that fails to decode as `Reply<T>`,
    but decodes as a CBOR map with a `meta` key, fails the call with `SyncError::UpdateRequired { status, message }`.
    The message is the decode error.
    It is not retried, since the same reply comes back.
    Any other undecodable reply stays a `TransportError`, retried as today.
  - Its WHY: every body refuses unknown keys and values (§Bodies), so whatever a newer server adds, an older app
    cannot decode; that app needs an update, not a retry.
  - A push or receipts reply this app cannot read settles nothing, since the engine settles only a decoded reply.
    The rows stay as that push left them, and once the app is updated the next push gets their outcomes as replays
    (§Push outcomes).
  - `Stop::UpdateRequired` (`status.rs`), from `Stop::of`.
    `is_waiting` (`error.rs:82-92`) includes it, so the runner waits for a trigger, with no poll, no backoff, and no
    `Error` event.
  - The addon: `StopWire::UpdateRequired` (`reason: "updateRequired"`), and `sync_error_codes::UPDATE_REQUIRED`
    (`"sync.update-required"`) from `error_code`.
  - TS: `SyncStop` gains `{ reason: "updateRequired" }`; `ERROR_MESSAGES` gains `sync.update-required`; and
    `useSyncStopMessage` returns `settings.sync.stop.update-required`.
    Both keys get `en` and `ru` translations in their libs' catalogs (`agents/I18N.md`).
  - `PROTOCOL.md`:
    - §Bodies: a client that meets a sync reply it cannot decode reads a newer server.
      It settles nothing from that reply and stops until the app is updated.
      A reply that is not a sync reply, one with no `meta`, is a failed call.
    - §Errors and §Push outcomes: a server that adds a code, outcome, or reason makes older apps stop that way.
    - §Rejected designs: an unknown variant per reply enum, with why (question 2).
  - `docs/specs/SYNC.md` §When Sync Stops, before "Anything else": the server is newer than this version of the app,
    so nothing syncs until the app is updated, and the message says so.
  - `crates/koloda-sync/README.md` and `apps/electron/IPC.md` §Sync, where they list stops or codes.
  Constraints:
  - No server change, and no change to the protocol crate's types.
  - `agents/BACKWARDS-COMPATIBILITY.md`: no alias for the old meaning of an unreadable reply.
  Done when:
  - Engine tests (`crates/koloda-sync/tests/engine/`):
    - a `409` error reply with the code `"brand_new"` fails the call with `UpdateRequired`, and the transport sent it
      once;
    - a push reply with an outcome `status` this app lacks stops sync as `Stop::UpdateRequired`, and the outbox rows
      are unsettled; with the fault gone, the next push settles them;
    - the runner waits after `UpdateRequired`: no `Error` event and no request until a trigger;
    - the HTML `502` case (`client_tests.rs:44`) still reads as `Transport`.
  - The addon's stop wire table gains `updateRequired`, and `error-parity.test.ts` passes with the new code.
  - The Settings → Sync problems test (`settings-sync-problems.test.tsx`) shows the update-required stop's text, if
    that file tests each stop's text; otherwise no TS test is added (§One home per behavior).
  - Each new engine case fails against today's `client.rs`, checked once by hand.
  - `cargo test -p koloda-sync`, `cargo test -p koloda-electron`, the `app` and `settings-react` lib tests, and
    `bun run check:push` pass.
  Manual verify:
  - Host: desktop.
  - Paths:
    - Point a synced desktop at a server built with one renamed error code or outcome status (a local build), then
      Sync now → Settings → Sync says the server is newer than the app; the title bar tooltip says the same.
    - Switch the language to Russian → the same message reads in Russian.
    - Stop the server → the message says the server can't be reached, as before.
  - Skip if: no local server build is at hand; the engine tests inject the same replies.
  Commit: Ask for an app update when a sync reply can't be read
  Depends on: none

## Outcome

<what shipped>
