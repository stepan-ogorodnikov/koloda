# Sync server audit follow-ups

Status: ready
Guides: agents/IMPLEMENTATION-PLAN.md, agents/TASKS.md, crates/koloda-server/README.md, crates/koloda-sync-proto/PROTOCOL.md, agents/TESTING.md, agents/CODE-DOCUMENTATION.md, agents/BACKWARDS-COMPATIBILITY.md, agents/MARKDOWN.md, agents/VERIFY.md, agents/REVIEW.md
Flow: local

## Intent

Fix the findings that the `sync-server-audit` task left as Later.
They come from the audit of the sync server (`crates/koloda-server`) at `447056b5` (`main`).
Its report was `tmp/audits/sync-server.md`, which git ignores.
`tasks/archive/sync-server-audit.md` kept their evidence; this file restates it, so neither needs to be open.
Each finding was checked again against `4fa1881b` when this task was scheduled, and each still holds.

Done when:

- a request with a wrong token is refused before the server reads its body, and a pairing preview or claim body
  past 16 KiB is refused;
- a pull page of a device's own entries stops after a fixed number of rows, so it never holds the space's reads for
  seconds;
- a CLI write beside `serve` makes a push wait, not fail with `500`;
- a failed or interrupted upload leaves no staged file once `serve` starts again;
- `PROTOCOL.md` §Errors names the count caps, and the missing-ids list refuses a `limit` out of range;
- the missing-ids list and the delete cascade read and prepare no more than each page or statement needs;
- tests pin the staleness and collection windows at their limits, and the events socket's close after 60 silent
  seconds;
- `bun run check:push` is green.

## Scope

Findings, numbered as in the report.
Line numbers are at `4fa1881b`.

- 4. Spec violation, Later: count caps answer `too_large`, and the missing-ids list clamps its `limit`.
  Decision: fix by item 5 (Open questions 3).
  - §Errors (`PROTOCOL.md:1000-1020`) gives `too_large` to "a body past its size or expansion cap" and `bad_request`
    to "a value out of range".
  - A push over 5,000 items (`push.rs:230-234`) and a probe over 1,000 ids (`known.rs:27-31`) answer `too_large`.
    A receipt range over 5,000 answers `bad_request` (`push.rs:75-79`).
  - Pull and bootstrap pages refuse a `limit` out of range as `bad_request` (`pull.rs:46-49`,
    `bootstrap.rs:76-79`).
    The missing-ids list clamps it into 1 to 1,000 instead (`attachments.rs:86`).
  - The engine always asks for `limit=1000` (`crates/koloda-sync/src/attachments.rs:51`).
    It treats `too_large` like `bad_request` only for an upload (`crates/koloda-sync/src/attachments.rs:270`); nothing
    branches on it for a push or a probe.
- 6. Risk, Later: unauthenticated bodies are read into memory, up to 16 MiB plus 16 MiB decompressed, before any check.
  Decision: fix by item 1 (Open questions 2).
  - Every body handler awaits `read_body` before `respond` runs auth: `push.rs:51`, `pairing.rs:63`, `:72`, `:80`,
    `attachments.rs:43`, `spaces.rs:21`, `known.rs:23`, and `devices.rs:99`.
  - `read_body` buffers up to `MAX_BODY_BYTES` and decompresses as much again (`http.rs:130-160`).
  - Preview and claim take no token, and their real bodies are under 1 KiB.
    A few dozen 16 MiB requests exhaust a small VPS; the trust model names resource exhaustion (§Trust model).
  - Preview and claim already count wrong codes per address (`pairing.rs:72-86`, `guarded`), but only after the body.
- 7. Risk, Later: staged attachment files are never removed after a failed write or a stop mid-upload.
  Decision: fix by item 4.
  - `store` stages the bytes at `.{id}.{uuid}.tmp` (`attachments.rs:154`), and returns early when `write_synced`
    fails (`:155`), leaving the partial file.
    A failed `rename` (`:167`) leaves one too, and so does a kill between staging and rename.
  - `rg '\.tmp' crates/koloda-server/src` finds only that line and `CURRENT.tmp` (`data_dir.rs:18`), so no sweep
    exists.
  - Staged files count toward no quota, and collection and backup pass them by.
    So nothing reports them, and they stay until an operator deletes them.
- 8. Risk, Later: writer transactions are deferred, so a CLI write to a database `serve` holds can fail a push with
  `500`.
  Decision: fix by item 3.
  - The server's write transactions read before they write: push (`push.rs:93`), bootstrap (`bootstrap.rs:85`, `:98`,
    `:117`, `:152`, `:187`), upload and collection (`attachments.rs:158`, `:270`), and `server.rs:104` and `:194`.
    On `server.db`: `devices.rs:112`, `:127`, `:184`, `pairing.rs:177`, and `spaces.rs:102`.
  - Four CLI commands write those files from another process while `serve` runs: `drop-envelope` and `write-schema`
    (a space database), and `pair` and `quota` (`server.db`).
  - In WAL mode a deferred transaction that read first, then meets another process's commit, fails its write with
    `SQLITE_BUSY_SNAPSHOT`.
    The busy timeout does not retry it, and the reply is `internal` (`http.rs:115-128`).
  - `drop_envelope.rs:79-81` documents this race and opens `Immediate`.
  - rusqlite 0.33 sets a connection's default with `Connection::set_transaction_behavior`.
- 9. Risk, Later: a pull scans every one of the caller's own entries up to the bound, holding the space's only reader.
  Decision: fix by item 2 (Open questions 4).
  - `read_page` skips own entries without counting them toward the entry or byte cap (`pull.rs:97-100`).
  - On the audit's scratch database, 2M own `cold` entries took 1.6 s on a warm cache to answer one empty page.
    The plan was indexed (`SEARCH v USING INDEX …`, `SEARCH h USING COVERING INDEX heads_version`).
  - The space has one reader connection (`server.rs:40`), which the reply meta of every device call also takes
    (`http.rs:307`).
    After an import of tens of millions of reviews, the importer's next `cold` pull holds the space's reads for tens of
    seconds; the engine's request timeout is 120 s (`crates/koloda-sync/src/transport.rs:29`).
  - A cut page already answers `scanned_through` at its last examined row and `has_more` (`pull.rs:114-124`).
    The engine pulls again while `has_more` holds, even after an empty page (`crates/koloda-sync/src/cycle.rs:321-325`).
- 10. Risk (tests), Later: the staleness and attachment-collection windows are not tested at their limits.
  Decision: fix by item 8.
  - `stale_tests.rs:70-81` checks 89 days, then 91 more; `:167-178` checks 23 hours, then 25 more.
    `attachments_tests.rs:386-409` checks 89 and 91 days.
  - The rules are `now - last_seen > window` (`devices.rs:293`) and `unlinked_since < now - 90 days`
    (`attachments.rs:266`, `:272`); a slip to `>=` or `<=` passes every test.
  - `agents/TESTING.md` (§Write tests for): test at the limit and one past it, as the lease TTL and `last_seen` tests
    do.
- 11. Risk (tests), Later: no test pins the events socket's close after 60 silent seconds.
  Decision: fix by item 8.
  - `events.rs:148-165` pings every 30 s (`PING_EVERY`, `:25`) and closes after 60 s without a ping or pong
    (`SILENT_FOR`, `:26`); §Events (`PROTOCOL.md:979`) says so.
  - `rg 'ping|silent|pause|advance' tests/server/events_tests.rs` finds nothing.
- 12. Improvement, Later: a cascade removes each review with two statements it prepares again each time.
  Decision: fix by item 7.
  - `delete` (`log.rs:108-131`) prepares `LIVE_REVIEWS` once per card, then calls `remove` per review.
    `remove` (`log.rs:435-451`) builds its `DELETE` with `format!` and runs it through `tx.execute`, which prepares on
    every call.
  - A 20M-review deck delete prepares about 40M statements in its one push transaction; not measured.
- 13. Improvement, Later: the missing-ids list restarts its index scan from the first id on every page.
  Decision: fix by item 6.
  - `attachments.rs:89-97` filters with `(?1 IS NULL OR r.attachment > ?1)`.
    Its plan reads `SCAN r USING COVERING INDEX attachment_refs_attachment`, so page *n* reads every ref before it.
  - The list runs once after a restore, and pages only past 1,000 missing ids.

In:

- `koloda-server`: the body handlers and `read_body` (`http.rs`), `read_page` (`pull.rs`), the writer connections
  (`db.rs`), staging and `serve`'s start (`attachments.rs`, `main.rs`), the missing-ids list, the delete cascade
  (`log.rs`), and their tests.
- `PROTOCOL.md`: §Bodies (item 1), §Pull cursor (item 2), and §Errors (item 5).
- `crates/koloda-server/README.md`, where it describes what each item changes.

Out:

- Finding 14, the one pairing bucket behind a proxy: accepted for v1 by `sync-server-audit`.
- The engine: each item keeps a reply the engine already handles.
- A set-based cascade delete (item 7, Open questions 5).

## Open questions

- [x] 1. Flow? — `local` (human, 2026-10-18).
- [x] 2. How does a token endpoint skip the body (finding 6)? — authenticate first, then read; as proposed (human,
  2026-10-18).
  The handler runs the token check through `authorize` (`http.rs:202`) before it reads the body.
  The work under `respond` checks it again, since the reply meta needs that scope; the second check is one indexed
  read.
  Preview and claim read at most 16 KiB of body, before or after zstd, and answer `too_large` past it.
  Not proposed: a check of the header's shape alone, which any made-up token passes.
- [x] 3. Count caps (finding 4): `too_large` or `bad_request`? — keep `too_large`, and say so in §Errors; as proposed
  (human, 2026-10-18).
  `413` is the specific code, and devices already receive it.
  The missing-ids list refuses a `limit` out of range as `bad_request`, as pull and bootstrap pages do.
  Not proposed: `bad_request` for the counts, which changes a code without a gain.
- [x] 4. Where does a pull page stop scanning (finding 9)? — after 50,000 examined rows; as proposed (human,
  2026-10-18).
  At the audit's 0.8 µs a row that holds the reader about 40 ms, and 2M own entries take 40 pages.
  Own entries and others' count alike, so a page of 5,000 entries never meets it.
- [x] 5. Prepared statements or a set-based delete (finding 12)? — `prepare_cached`; as proposed (human, 2026-10-18).
  It needs no SQL change.
  A set-based delete per card must collect the review ids first, since deleting `versions` changes what `LIVE_REVIEWS`
  then reads.

## Plan

- [x] 1. Read a body only after its token checks
  Goal (finding 6; per question 2):
  - Every endpoint that takes a device or setup token checks it before it reads the body:
    push, `ids/known`, attachment upload, fork, pairing issue, and space creation.
    A failed check answers its usual error reply, and the body is never read.
    The check runs through `authorize` (`http.rs:202`); the work under `respond` checks it again for the reply meta.
  - Preview and claim (`pairing.rs:72-86`) take no token.
    They read at most 16 KiB, before and after zstd, and answer `too_large` past it.
    The constant's WHY: a real preview or claim is under 1 KiB, and anyone can send one.
  - `PROTOCOL.md` §Bodies: the server reads a body only after its token checks.
    A preview or claim body is at most 16 KiB.
  - The README, where it describes `read_body` or the request path.
  Constraints:
  - `koloda-server` and `PROTOCOL.md` only; devices send nothing near the new cap.
  - Every reply keeps its status and code.
  - `require_device` writes `last_seen` and the rebase flag (`auth.rs:176-184`).
    A second check must give the same answer and write nothing more, or the work must take the first check's caller.
  Done when:
  - A server test: a push with a token that names no device, and a body stream that fails when read, answers
    `401 unknown_device`.
    Today it answers `413` from the failed read.
    The same holds for a missing setup token on space creation.
  - A server test: a claim body of 16 KiB gets past the cap, and one of 16 KiB plus one byte answers `too_large`.
  - Every existing server test passes unchanged.
  - `cargo test -p koloda-server` and `cargo test -p koloda-sync` pass, and `bun run check:push` is green.
  Manual verify: none — what changes is when the server reads a body; the tests send the refused requests.
  Notes: today's work already checked the token before it used the body, so a wrong token answered `401` either way,
  but only after reading up to 16 MiB.
  So the test sends a body stream that records whether it was polled: unread after a token naming no device or a
  missing setup token, read once the token checks.
  Both new tests failed against the old handlers.
  The handlers go through `respond_with_body` (`http.rs`), and `read_body` takes its cap.
  Commit: Read a body only after its token checks
  Depends on: none

- [x] 2. Stop a pull page after a fixed number of examined rows
  Goal (finding 9; per question 4):
  - `read_page` (`pull.rs:66-125`) stops after 50,000 examined rows, the caller's own included.
    The page answers `scanned_through` at the last examined row and `has_more`, as a page cut by its entry or byte cap
    does.
  - The constant's WHY: the space has one reader, and every device call's reply meta waits for it.
  - Tests need a smaller cap.
    Put it where tests can set it, as `Storage` holds `max_space_pages` (`quota.rs:39-48`), or write the rows
    directly.
  - `PROTOCOL.md` §Pull cursor: a page also stops after 50,000 examined rows, so a page may be empty and still have
    more.
  Constraints:
  - `koloda-server` and `PROTOCOL.md` only.
    The engine already pulls again while `has_more` holds (`crates/koloda-sync/src/cycle.rs:321-325`).
  - Bootstrap pages do not change; they skip nothing.
  Done when:
  - A pull test: with own entries past the cap, a page is empty, its `scanned_through` is the cap-th row's seq, and
    `has_more` holds; the next page goes on from there and reaches the others' entries.
    At exactly the cap the page reaches its bound.
  - `cargo test -p koloda-server` and `cargo test -p koloda-sync` pass, and `bun run check:push` is green.
  Manual verify: none — it needs a space with tens of thousands of one device's entries; the test counts the rows.
  Notes: the test writes the 50,000 own heads straight into the space database, since pushing them took 22 s in a debug
  build; the cap stays a private constant.
  Against the old `pull.rs` the cut page held the phone's entry.
  Commit: Stop a pull page after a fixed number of examined rows
  Depends on: none

- [x] 3. Open the server's write transactions at once
  Goal (finding 8):
  - The connections that write open `Immediate` transactions by default, through
    `Connection::set_transaction_behavior`.
    These are each space's writer and the `server.db` connection, from `db::open_space` and `db::open_server`
    (`db.rs:31-38`).
    Readers stay deferred.
  - Its WHY: CLI commands write these files from another process while `serve` runs.
    A deferred transaction that read first then fails its write with `SQLITE_BUSY_SNAPSHOT`, which the busy timeout
    does not retry; an immediate one waits for the lock.
  - `drop_envelope.rs:79-81` may then rely on the default; keep its comment's WHY either way.
  Constraints:
  - `koloda-server` only.
  Done when:
  - A unit test in the crate, beside `heads_index_tests.rs`: a space writer and a `server.db` connection, each opened
    as the server opens it, begin `transaction()`.
    A second connection with no busy timeout then cannot begin an immediate write (`SQLITE_BUSY`).
    It fails against today's `db.rs`.
  - `cargo test -p koloda-server` and `cargo test -p koloda-sync` pass, and `bun run check:push` is green.
  Manual verify: none — the race needs a CLI write in the instant between a push's read and its write.
  Notes: the test is `src/db_tests.rs`; `drop_envelope.rs` keeps its explicit `Immediate`, since a CLI process opens
  its own connection.
  Commit: Open the server's write transactions at once
  Depends on: none

- [x] 4. Remove staged uploads that never landed
  Goal (finding 7):
  - `store` (`attachments.rs:153-170`) removes its staged file when the write, the rename, or anything between them
    fails, as it already does when the room check refuses.
  - `serve` removes each space's staged `attachments/.*.tmp` files before it listens.
    Only `serve` sweeps: CLI commands run beside a serving process, whose upload may be staging.
    Its WHY: a kill mid-upload leaves a file that no quota counts and no collection sees.
  - The README, §Data directory: an upload stages its bytes beside the attachment, and `serve` removes leftovers when
    it starts.
  Constraints:
  - `koloda-server` only.
  Done when:
  - A test starts `serve` with a staged file in a space's attachments directory, as the SIGTERM test starts it.
    Once it listens, the staged file is gone and a stored attachment beside it is still there.
  - If no test can make the staged write fail, the item notes say so and why.
  - `cargo test -p koloda-server` passes, and `bun run check:push` is green.
  Manual verify: none — a failed disk write or a kill mid-upload; the test arranges the leftover.
  Notes: a test can make the landing fail after all: a directory where the bytes belong fails their rename, and
  `an_upload_that_fails_to_land_leaves_no_staged_file` finds only that directory left.
  `store` stages the bytes, `land` renames and records them, and `store` removes the staged file whatever `land` did.
  Both new tests failed against the old code.
  Commit: Remove staged uploads that never landed
  Depends on: none

- [x] 5. Name the count caps under too_large and refuse a missing-ids limit out of range
  Goal (finding 4; per question 3):
  - `PROTOCOL.md` §Errors: `too_large` is a body past its size or expansion cap, or a list past its count cap.
    The count caps are a push's 5,000 items and a probe's 1,000 ids.
  - The missing-ids list (`attachments.rs:86`) refuses a `limit` of 0 or above 1,000 as `bad_request`, as pull does
    (`pull.rs:46-49`), instead of clamping it.
  Constraints:
  - `koloda-server` and `PROTOCOL.md` only; push and probe keep their codes.
  Done when:
  - An attachments test: `limit` 1 and 1,000 answer a page, and 0 and 1,001 answer `bad_request`.
  - `cargo test -p koloda-server` and `cargo test -p koloda-sync` pass, and `bun run check:push` is green.
  Manual verify: none — devices always ask for 1,000.
  Commit: Name the count caps under too_large and refuse a missing-ids limit out of range
  Depends on: none

- [x] 6. Seek the missing-ids list from its last id
  Goal (finding 13):
  - The list's statement (`attachments.rs:89-97`) becomes a `pub(crate) const`.
    It filters `r.attachment > ?1` and binds `''` when `after` is absent, so each page searches the index from its
    last id.
  - A plan test, as `heads_index_tests.rs` does for `heads`, asserts the statement searches
    `attachment_refs_attachment` with a range (`attachment>?`), not a scan.
  Constraints:
  - `koloda-server` only; the answers do not change.
  Done when:
  - The plan test passes, and fails against today's statement, checked once by hand.
  - The existing missing-ids tests pass unchanged.
  - `cargo test -p koloda-server` passes, and `bun run check:push` is green.
  Manual verify: none — a query plan; nothing a device sees changes.
  Notes: the plan test sits in `heads_index_tests.rs`, whose module doc now names the missing-ids page.
  Against the old filter the plan read `SCAN r USING COVERING INDEX attachment_refs_attachment`.
  Commit: Seek the missing-ids list from its last id
  Depends on: 5

- [x] 7. Reuse the delete cascade's prepared statements
  Goal (finding 12; per question 5):
  - `delete` (`log.rs:108-131`) and `remove` (`log.rs:435-451`) prepare through `prepare_cached`: `LIVE_REVIEWS`, and
    both of `remove`'s statements.
    `remove`'s `DELETE FROM versions` becomes a constant string, so its cache key is fixed.
  - Its WHY: a deck delete runs two statements per review in one push transaction, about 40M for 20M reviews.
  Constraints:
  - `koloda-server` only; no SQL changes meaning.
  Done when:
  - The existing cascade tests (`deletes_tests.rs`) pass unchanged.
  - A deck delete of about 100k reviews is timed once by hand before and after, and the item notes record both.
  - `cargo test -p koloda-server` and `cargo test -p koloda-sync` pass, and `bun run check:push` is green.
  Manual verify: none — the same deletes, prepared once.
  Notes: timed once each, debug build, with 1,000 cards and 100,000 reviews written straight into a space database by
  a throwaway test: the deck delete took 24.0 s before and 13.3 s after.
  `remove`'s `DELETE FROM versions` keeps its `format!` with `UNPINNED`: the text is the same on every call, so it is
  one cache entry, and a literal copy of the pin rule could drift from it.
  Commit: Reuse the delete cascade's prepared statements
  Depends on: none

- [x] 8. Test the staleness and collection windows at their limits, and the silent socket's close
  Goal (findings 10 and 11):
  - `stale_tests.rs`: a device idle exactly 90 days is not stale, and one 1 ms past is.
    A forked-from record idle exactly 24 hours is not stale, and 1 ms past is.
    These replace the 89 and 91 day and the 23 and 25 hour steps (`:70-81`, `:167-178`) in the same change.
  - `attachments_tests.rs`: an attachment unlinked exactly 90 days is kept, and 1 ms past is collected; this replaces
    the 89 and 91 day steps (`:386-409`).
  - `events_tests.rs`: under `tokio::time::pause()`, a socket that answers no ping is still open just before 60 s and
    closed at 60 s.
    If the socket harness cannot run under paused time, the item notes say why and what the test does instead.
  Constraints:
  - Tests only.
  Done when:
  - Each new case fails once by hand with its rule changed: `>=` in `devices.rs:293`, `<=` in `attachments.rs:272`,
    and `SILENT_FOR` raised.
  - `cargo test -p koloda-server` passes, and `bun run check:push` is green.
  Manual verify: none — tests only.
  Notes: paused time needs tokio's `test-util`, which the server's dev-dependencies now enable.
  The client reads the 30 s ping at 59 s and nothing after, since its pong goes out only on its next read.
  The socket test passed 30 runs in a row; each case failed with its rule changed, and with `>` in the silence check.
  Commit: Test the staleness and collection windows at their limits, and the silent socket's close
  Depends on: none

## Outcome

<what shipped>
