# Late images reach other devices promptly

Status: ready
Guides: agents/IMPLEMENTATION-PLAN.md, agents/TASKS.md, crates/koloda-sync/README.md, crates/koloda/src/repo/sync/README.md, agents/RUST.md, crates/koloda-server/README.md, crates/koloda-sync-proto/PROTOCOL.md, crates/koloda-sync-proto/README.md, docs/specs/SYNC.md, docs/specs/MEDIA.md, apps/electron-e2e/README.md, libs/e2e/README.md, agents/VERIFY.md, agents/TESTING.md, agents/CODE-STYLE.md, agents/CODE-DOCUMENTATION.md, agents/BACKWARDS-COMPATIBILITY.md, agents/MARKDOWN.md, agents/REVIEW.md
Flow: local

## Intent

A synced card shows on the other devices as soon as its rows arrive, and its image follows as soon as the server has
it, without waiting for the next poll.
This is the follow-up that `tasks/archive/sync-e2e-audit.md` (Open questions, 9) left: its finding 4, an e2e test of an
image that arrives while its card is on screen, needs these engine changes first.
This file restates the evidence, so the next session does not need that one.

Done when:

- new rows reach the screens before the cycle's image downloads start;
- an image fetch that waits for an upload runs when its wait ends, with no trigger needed;
- another device's upload makes the waiting fetches of every device in the space run at once;
- the desktop sync spec shows an image that arrives while its card is on screen;
- `bun run check:push` is green, and a desktop suite run passes.

## Scope

What happens today, at `adf4dc89` (`main`):

- Screens learn of new rows only after the tick's image transfers.
  - `run_cycle` emits `Event::Changed` after `recorded_cycle` returns (`crates/koloda-sync/src/engine.rs:331-337`).
  - `recorded_cycle` runs `sync` (`:349-358`), which runs the cycle, the missing-image check, and the transfers, in
    that order (`:386-425`).
  - So a backlog of image downloads holds back new cards and reviews on screen until the downloads end.
    `docs/specs/SYNC.md` §Status: "Screens that show synced data refresh as changes arrive", and a change "usually
    shows on the others within seconds".
  - The host forwards each event to the renderer as it comes (`apps/electron/src-rust/src/sync.rs:505-516`).
- A fetch that waits for an upload does not wake the device.
  - A fetch answered `404` defers 1 minute, doubling up to 6 hours (`crates/koloda-sync/src/attachments.rs:170-178`,
    `crates/koloda/src/repo/sync/attachments.rs:17-18`, `:194-210`); `PROTOCOL.md` §Download says it "tries again".
  - After a cycle the runner sleeps until the poll, 5 minutes while the events socket is up and 60 seconds otherwise,
    or until a trigger (`crates/koloda-sync/src/runner.rs:172-181`).
    Only a push waiting on server time shortens that sleep (`push_wait_left`).
  - So a device that showed a card before its image reached the server shows the alt text for up to the poll after
    the wait ends: about 5 minutes with the socket up.
- An upload nudges no device.
  - The events socket carries only `{ head_hot, head_cold }`, sent again when a push moves a head (`PROTOCOL.md`
    §Events; `crates/koloda-server/src/server.rs:229-238`, `push.rs:217`).
  - A device fires a trigger only when the heads are past the last it saw (`crates/koloda-sync/src/events.rs:118-121`,
    `:175-177`); the upload handler publishes nothing (`crates/koloda-server/src/attachments.rs`).
  - So once the backoff has grown, an image uploaded by a device that was offline reaches the others only when that
    wait ends, up to 6 hours later.
- The e2e test that needs this (`tasks/archive/sync-e2e-audit.md`, Plan item 2, kept as written there):
  - a loopback proxy in front of device B holds `GET /v1/spaces/{space}/attachments/{id}`;
  - device A adds a card with an image in a markdown field, B opens a lesson on it and sees the alt text;
  - the proxy releases, and B shows the image without a reload.
  - It needs the first change: today, holding B's download also holds the card off B's screen.
  - Images go in markdown fields only (`docs/specs/MEDIA.md` §Inserting Images); the desktop starter template's fields
    are `text` (`libs/srs/src/lib/templates.ts:89-100`), so the spec makes a template with a markdown field.
    The field's "Insert image" button wraps a hidden file input
    (`libs/srs-react/src/lib/cards/card-content-text-area.tsx:178-187`).
  - The lesson loads images through `useAttachmentImages`, which swaps a missing image for its alt text and puts it
    back on `attachmentsFetched` (`libs/srs-react/src/lib/lessons/use-attachment-images.ts:33-73`).

In:

- `koloda-sync`: when `Changed` goes out, the runner's sleep, and the events socket's upload nudge.
- `koloda` `repo/sync/attachments.rs`: when the next transfer is due, and releasing fetches that wait for an upload.
- `koloda-server`: a nudge after an upload is stored.
- `koloda-sync-proto`: the events frame and `PROTOCOL.md` §Cycle, §Events, and §Download.
- `apps/electron-e2e`: the late-image case of `sync.spec.ts`, a proxy, and the README.

Out:

- Device policy for fetches (metered networks, on demand); `PROTOCOL.md` §Download keeps "until device policy
  exists, every queued fetch runs".
- Uploads waiting for room: they already go once a device record shows room (`release_deferred_uploads`).
- `SYNC.md`: the change makes §Status true as written; no copy changes.

## Open questions

- [x] 1. How does an upload nudge the devices? — the events frame gains an upload count, as proposed (human,
  2026-10-17).
  - The frame becomes `{ head_hot, head_cold, uploads }`, with `uploads` counting the images this server process
    stored for the space; it is not persisted, so it starts at 0 after a restart.
  - A device compares it with the previous frame on the same socket; the first frame sets the base.
    On a change it releases every fetch that waits (their backoff resets) and fires a trigger.
  - Releasing them all costs one quick `404` for each image still missing, which is what the backoff saves; a frame
    per stored id would say which fetch to release, at one frame per image in a burst.
  - The other way is no nudge: item 2 alone bounds the delay by the fetch's backoff, up to 6 hours.
- [x] 2. Mixed versions: an app from before the change refuses the new frame, since bodies reject unknown keys
  (`PROTOCOL.md` §Bodies). — accept, as proposed (human, 2026-10-17).
  Such an app's socket then closes on every frame and the device polls every 60 seconds, as without a socket.
  The project is pre-release (`agents/BACKWARDS-COMPATIBILITY.md`), and how an older app treats a newer server is the
  open decision of `tasks/archive/sync-proto-audit.md` (finding 16).
- [x] 3. Who runs the desktop suite while implementing? — the agent; the human gave permission (human, 2026-10-17).
  `agents/VERIFY.md` needs that permission in the implementing session; item 2 can only be proven by a run.
- [x] 4. Flow? — `local` (human, 2026-10-17).

## Plan

Written for the answers to Open questions 1 to 3.

- [ ] 1. Tell the screens about synced rows before images download
  Goal:
  - `sync` (`crates/koloda-sync/src/engine.rs:386-425`) emits `Event::Changed` for the kinds the cycle changed once the
    rounds and any restore are done, before the missing-image check and the transfers.
  - Each kind goes out once per `run_cycle`: `run_cycle` (`:330-345`) emits only kinds not yet sent, so a cycle that
    errors still reports what it changed, as its comment says.
  - `sync_now` and `tick` return the same kinds as today.
  - INVARIANT comment at the emit: rows reach the screens before images move, so a slow download holds back no card
    (`SYNC.md` §Status).
  - `crates/koloda-sync/README.md` and `PROTOCOL.md` §Cycle ("Attachment transfers run after the rounds") say the host
    hears of the rows before the transfers.
  Constraints: `koloda-sync` only; the event's shape and the host do not change.
  Done when:
  - A new engine test applies a card whose image fetch is held by the harness observer
    (`crates/koloda-sync/tests/engine/common.rs:703-704`) and sees `Changed` while the fetch waits; it fails against
    today's `engine.rs`, checked once by hand.
  - `cargo test -p koloda-sync` passes, and `bun run check:push` is green.
  Manual verify: none — the e2e case in item 2 is the end-to-end check.
  Commit: Tell the screens about synced rows before images download
  Depends on: none

- [ ] 2. Cover an image that arrives while its card is on screen in the sync spec
  Goal: `tasks/archive/sync-e2e-audit.md` Plan item 2, as written there:
  - `apps/electron-e2e/src/sync-proxy.ts` exports `startSyncProxy(targetUrl)`: a loopback proxy that forwards every
    request and the events socket's upgrade, holds each `GET …/attachments/{id}` (not `…/attachments/missing`) until
    `release()`, and returns `{ url, release, stop }`.
  - Device B joins through the proxy's URL.
  - Device A adds a template with a markdown field, a deck that uses it, and a card whose markdown field holds a small
    PNG attached through the field's hidden file input (`setInputFiles` with a buffer).
  - B opens a lesson on that deck and sees the image's alt text; the spec releases the proxy, and B shows the image
    without a reload.
  - `apps/electron-e2e/README.md`: the proxy in the Architectural Map, and images in the sync spec line.
  Constraints:
  - Test code only; steps stay in the spec or suite-local helpers, not `libs/e2e`.
  - The proxy lives inside the test, as the server does; if the spec finds a product bug, stop and report it.
  Done when:
  - `bunx nx run electron-e2e:typecheck` and `bun run check:push` pass.
  - A filtered run of `sync.spec.ts` passes three times in a row.
  - With the proxy's release removed the spec fails at the image, and against item 1's parent it fails at the lesson,
    each checked once by hand.
  Manual verify: none — the change is the test itself, and its run is the check.
  Commit: Cover an image that arrives while its card is on screen in the sync spec
  Depends on: 1

- [ ] 3. Wake the runner when a waiting transfer falls due
  Goal:
  - `koloda` `repo/sync/attachments.rs` gains the earliest `next_attempt_at` among queued transfers that are not
    waiting for room, through `sync_attachment_queue_due_idx`.
  - After a cycle, the runner sleeps until the poll, the push wait, or that time, whichever comes first
    (`crates/koloda-sync/src/runner.rs:172-181`); a time already past wakes it at once.
  - `PROTOCOL.md` §Cycle: a waiting transfer wakes the device when its wait ends; §Download's "tries again" is then
    what happens.
  Constraints: `koloda` and `koloda-sync`; no migration, since the index exists (`V18`).
  Done when:
  - A `koloda` integration test pins the due time: the earliest wait, a transfer waiting for room left out, none queued.
  - An engine test on the manual timer: a fetch answered `404`, then the image uploaded, and with the socket up the
    runner fetches it 60 s later with no trigger; it fails against today's runner, checked once by hand.
  - `cargo test -p koloda -p koloda-sync` passes, and `bun run check:push` is green.
  Manual verify: none — timing only the tests arrange.
  Commit: Wake the runner when a waiting image transfer falls due
  Depends on: none

- [ ] 4. Nudge the space's devices when an image is uploaded
  Goal (Open questions, 1):
  - `koloda-sync-proto`: the events frame is `{ head_hot, head_cold, uploads }`; `PROTOCOL.md` §Events says when the
    server sends it and what `uploads` counts.
  - `koloda-server`: storing a new image bumps the space's upload count and sends the frame to every socket of the
    space; an idempotent re-`PUT` of a stored id sends nothing.
  - `koloda`: releasing every fetch that waits resets its backoff, as `release_deferred_uploads` does for uploads.
  - `koloda-sync` `events.rs`: a frame whose `uploads` differs from the previous frame's on that socket releases the
    waiting fetches and fires a trigger; heads keep their own rule.
  - `PROTOCOL.md` §Download: a stored upload releases the fetches that wait for it.
  Constraints: no migration; the count lives in the server process.
  Done when:
  - A server test: an upload sends a frame with a higher `uploads` to another socket of the space, and a re-`PUT` of
    the same id sends none.
  - An engine test: a device whose fetch waits after a `404` fetches the image right after another device uploads it,
    on the manual timer with no time passing.
  - The proto tests pin the frame's keys.
  - `cargo test -p koloda-sync-proto -p koloda-server -p koloda -p koloda-sync` passes, and `bun run check:push` is
    green.
  Manual verify: none — the e2e case covers the path; this one needs a late upload.
  Commit: Nudge the space's devices when an image is uploaded
  Depends on: 3

## Outcome

<what shipped>
