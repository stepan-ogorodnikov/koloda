# Sync server core

Status: ready

## Intent

Build the first slice of `koloda-server`, the self-hosted server that `crates/koloda-sync-proto/PROTOCOL.md`
describes.
It keeps one envelope log per space, enrolls devices, and answers push, pull, and bootstrap.
The sync engine task then builds the cycle against a real server instead of the fake space in `koloda`'s tests.
Nothing user-visible changes until the engine and the desktop UI land.

Done when:

- `koloda-server init` creates a data directory and prints the setup token, and `koloda-server serve` serves it;
- in-process tests take devices through space creation, pairing, push, receipts, pull, `ids/known`, bootstrap,
  deletes, revocation, and fork, with every outcome and error as `PROTOCOL.md` states;
- the server reads envelope headers and never decodes a payload;
- `PROTOCOL.md` §Transport gives the request and response body of every endpoint the server serves;
- `bun run check:push` is green and runs the server's lint and tests.

## Scope

In:

- `crates/koloda-server`: a binary crate that links `koloda-sync-proto` only, with its nx project wired into the checks.
- The data directory: `CURRENT`, generations, `server.db`, one database per space, and a single-process lock.
- The `init` and `serve` commands.
- CBOR bodies with zstd, request limits, and the metadata every response carries.
- Spaces: create, which enrolls the creator, and list, both with the setup token.
- Pairing: issue (device token, or setup token for break-glass), preview, claim, the setup hint, and guess limits.
- Push: sender sequences, receipts, heads, compaction on write, existence checks, the `write_schema` gate with
  `held { schema }` and `held { dependency }`, and the absolute clock guard.
- Deletes: tombstones, `deleted_ids` fences, cascades to descendants in one transaction, `fenced`, and
  `dependency_fenced`.
- `ids/known`, pull, and bootstrap with snapshot leases.
- Devices: list, revoke, detach, and fork.
- Endpoint body types in `koloda-sync-proto`, and `PROTOCOL.md` updates, each with the item that makes them true.

Out:

- The `events` WebSocket and its nudges; the engine converges by polling until they land.
- Chunked delete cleanup and logical deletion scopes; a delete removes its descendants in one transaction.
- Tombstone and attachment GC, stale-device marking, GC horizons above zero, `cursor_too_old`, and `rebase_required`.
- Quotas, disk watermarks, `held { quota }`, and `507`.
- Attachments: their endpoints, `attachment_refs`, and `missing_attachments`.
- Built-in TLS (question 4).
- Backup, restore, epoch changes, and restore points; a claim returns an empty list of them.
- Operator commands other than `init` and `serve`: `spaces`, `pair`, `drop-envelope`, and raising `write_schema`.
- The Docker image and compose example.
- The sync engine, NAPI, and UI; `crates/koloda` is untouched.
- A product spec for running a server; it lands with the operator commands.

## Open questions

- [x] Area guides? — `agents/TASKS.md`, `agents/IMPLEMENTATION-PLAN.md`, `agents/MARKDOWN.md`,
  `agents/CODE-DOCUMENTATION.md`, `agents/CODE-STYLE.md` (change discipline), `agents/TESTING.md`,
  `crates/koloda-sync-proto/PROTOCOL.md` and its README, plus `agents/REVIEW.md` for self-review.
  `agents/RUST.md`, `agents/DB.md`, and `docs/decisions/TS-RUST-DOMAIN-MIRRORING.md` do not apply: the server never
  links `koloda`, has its own migrations, and has no TypeScript twin.
- [x] 1. What does this slice include? — everything under Scope In, bootstrap with snapshot leases included.
  A join needs bootstrap: a pull from seq 0 in `seq` order can meet a deck before any live algorithm
  (`PROTOCOL.md` §Bootstrap).
- [x] 2. Where do the endpoint body types live? — a new `transport` module in `koloda-sync-proto`, with the shared
  limits; the engine reuses it.
- [x] 3. HTTP and storage stack? — axum on tokio; rusqlite (bundled) in WAL mode, one writer per space behind a mutex;
  refinery with one `V1` per database that items extend until the task lands, since nothing outside this branch has
  applied it; the `zstd` crate; clap.
- [x] 4. TLS? — not in this task: `serve` speaks plain HTTP behind a TLS reverse proxy.
  Built-in rustls comes with the operator task, next to the Docker image.
- [x] 5. How does the first device enroll? — `POST /v1/spaces` creates the space and enrolls the creator in one call;
  the same nonce returns the same result.
- [x] 6. Protocol gaps this task fills? — all of these, each written into `PROTOCOL.md` by the item that
  implements it:
  - every response body is `{ meta, ok }` or `{ meta, error }`, and `meta` carries what §Endpoints lists;
  - a push is atomic: it consumes every new item or none; `seq_reused` can only follow replays, so stopping there
    consumes nothing new;
  - a seq at or below the sender's high-water with no receipt is `seq_reused`, like one with a different digest;
  - a stamp more than 5 minutes ahead of server now fails the whole push with `stamp_ahead`; nothing is consumed, so
    its cohorts return to `local`;
  - `schema_read_only` also fails the whole push and consumes nothing;
  - `held { dependency }`: the envelope names, as its id, parent, or hard ref, an entity whose create this sender had
    held; it clears once this sender's create of that entity is applied;
  - a card create naming a dead template is `dependency_fenced { drop_entity }`; a pointer group naming a dead
    referent is `dependency_fenced { repair_pointer }`;
  - wrong pairing codes are limited per client address and server-wide, because a wrong code names no space;
  - an unmatched device token is `401 unknown_device`;
  - a device token on another space's path gets `404 unknown_space`, the same as a missing space;
  - pull records the caller's cursor per lane, for GC later.
- [x] 7. Routing docs? — the human adds the `agents/INDEX.md` rows for server work, routing to
  `crates/koloda-server/README.md` and `PROTOCOL.md`; agents do not open that file.
  No `docs/decisions/APP-ROLES.md` row: the server is a crate with no product surface, and its README says so.

## Plan

- [ ] 1. Add the koloda-server crate with space creation
  Goal: new crate `crates/koloda-server`: `src/lib.rs` holds the server, and `src/main.rs` is a thin CLI over it.
  Workspace member with `[lints] workspace = true`, `autotests = false`, and one test binary `tests/server/main.rs`.
  It depends on `koloda-sync-proto` and never on `koloda`.

  Build wiring:
  - `project.json` with `lint` (`cargo clippy -p koloda-server --all-targets -- -D warnings`) and `test`
    (`cargo test -p koloda-server`), shaped like `crates/koloda-sync-proto/project.json`.
  - Its cache inputs add `{workspaceRoot}/crates/koloda-sync-proto/**/*`, because it links that crate.
  - Root scripts `test:rust`, `check:commit`, `check:rust`, and `check:rust-push` run both targets.

  Commands:
  - `koloda-server init --data-dir <dir>` creates the layout, prints the setup token once, and refuses a directory
    that already holds one.
  - `koloda-server serve --data-dir <dir> --listen <addr>` refuses an uninitialized directory.
    It holds an exclusive lock on the directory, so a second `serve` fails.

  Data directory: `CURRENT` names the active generation, which holds `server.db` and `spaces/<space>.db`.
  Every database runs in WAL mode with embedded migrations.
  `server.db` holds the setup token hash, spaces, devices, and space-creation replay results.
  A device row has its token hash, name, platform, created and last-seen times, and revocation time.
  Tokens are 256 random bits, stored as SHA-256.
  A space database starts with its id, name, epoch (a fresh UUID), and `write_schema` 1 for every kind.

  HTTP:
  - CBOR request and response bodies, with `Content-Encoding: zstd` accepted on requests and sent when accepted.
  - Request body size and zstd expansion are capped (`413`); malformed bodies are `400`.
  - Every response body is `{ meta, ok }` or `{ meta, error }`.
  - `meta` carries server time on every response.
    For a device caller it adds the epoch, both lane heads, both GC horizons (zero until GC exists),
    `write_schema` per kind, and the caller's `last_sender_seq`.
  - Server time comes from an injected clock.
  - A bearer extractor resolves a device token to its device and space.
    An unmatched token is `401 unknown_device`, a revoked device `401 revoked`, both with the epoch when known.
    A token on another space's path is `404 unknown_space`, the same as a missing space.

  Endpoints, both with the setup token:
  - `POST /v1/spaces`: body has space name, device name, platform, and nonce.
    It creates the space database, enrolls the creator, and returns space id, device id, token, and epoch.
    The same nonce returns the same result, token included.
  - `GET /v1/spaces`: id, name, creation time, and device count of each space.

  Endpoint bodies and the shared limits go in `crates/koloda-sync-proto/src/transport.rs`.
  `PROTOCOL.md` §Transport gains the response envelope, these bodies, and the rule that space creation enrolls the
  creator.
  The crate README follows the shape of the proto crate's: where it sits, the map, and "Does NOT own".
  The root README layout lists `koloda-server`.
  Constraints:
  - the server never decodes a payload;
  - tests drive the router in-process, with no sockets, a temporary data directory, and a manual clock;
  - no sleeps;
  - only the tables this item uses.
  Done when: tests in `crates/koloda-server/tests/server/` cover:
  - `init` refusing an initialized directory, `serve` refusing an uninitialized one, and a second lock holder failing;
  - space creation, its replay by nonce returning the same token, and a new nonce creating a second space;
  - a missing or wrong setup token (`401`), and the space list;
  - an unmatched device token (`401 unknown_device`), and a token on another space's path (`404 unknown_space`);
  - a body at the size cap and one byte past, and a zstd body past the expansion cap;
  - `meta` on a device call;
  - `bun run check:push` green, running the new crate's lint and tests.
  Commit: Add the koloda-server crate with space creation
  Depends on: none

- [ ] 2. Pair devices with short-lived codes
  Goal: `POST /v1/spaces/{space}/pairings` issues a code.
  It takes a device token of that space, or the setup token for break-glass, and an optional setup hint.
  The hint is opaque bytes with a size cap.
  A code is 10 characters of Crockford base32, single use, and expires 10 minutes after issue.
  The server stores its hash, issuer, space, expiry, and hint.

  `POST /v1/pairings/preview` takes `{ code }` and returns the space name, epoch, and approximate counts and bytes.
  It does not consume the code.
  Counts and bytes stay zero until item 3 stores heads.

  `POST /v1/pairings/claim` takes `{ code, name, platform, nonce }`.
  It enrolls a device and returns space id, device id, token, epoch, restore points (an empty list), and the hint.
  The same nonce returns the same result until the code expires.
  A different nonce on a claimed code fails like an unknown code.
  So do an expired code and a wrong one, so a response never says which.

  Failed previews and claims are limited per client address and server-wide (`429`), because a wrong code names no
  space.
  The limits are constants; tests read the client address from a request extension.
  Bodies go in the proto `transport` module; `PROTOCOL.md` §Pairing gets the code format, the claim replay, and the
  limits.
  Constraints: codes travel only in bodies; no code or token is logged.
  Done when: tests cover:
  - issue by a device and by the setup token, and refusal for a device of another space;
  - preview leaving the code claimable;
  - claim enrolling a device whose token then works, and a replay returning the same token;
  - a second nonce, a wrong code, and a code at its expiry and one millisecond past, all failing alike;
  - the address limit and the server-wide limit, each at the limit and one past;
  - the hint returned on claim.
  Commit: Pair devices into a space with short-lived codes
  Depends on: 1

- [ ] 3. Accept pushed envelopes with sender sequences and receipts
  Goal: `POST /v1/spaces/{space}/push` takes items `{ sender_seq, envelope }` in strictly ascending `sender_seq`.
  The batch has an item cap and a byte cap.
  Each envelope goes through `Envelope::decode`, which checks limits and the header allowlist.
  A batch with an undecodable envelope or out-of-order seqs is `400` and consumes nothing.
  The whole batch runs in one transaction under the space's writer lock, and the response is sent after commit.

  Per item:
  - At or below the sender's high-water, a receipt with the same digest returns its stored outcome with
    `replayed = true`.
    Any other is `seq_reused`, and processing stops there.
  - The clock guard runs first: an HLC wall part more than 5 minutes ahead of server now fails the whole push with
    `stamp_ahead` (`check_not_ahead_of_server`), consuming nothing.
  - A new item gets its outcome by class against the heads:
    a create is `applied` if the entity has no create head, else `stale`;
    an immutable row is `applied` if absent, else `stale`;
    an update is `applied` if its `(hlc, stamp_device)` beats the head, else `stale` (an equal stamp is `stale`).
  - `applied` stores the bytes and digest as a version at the lane's next `seq` and moves the head.
    The superseded version is removed in the same transaction (compaction on write).
  - The receipt (digest and outcome) and the sender's high-water commit with the item.

  `GET /v1/spaces/{space}/receipts?sender&after&through` returns stored outcomes for any sender of the space, over a
  capped range.
  `meta` now reports the lane heads and the caller's `last_sender_seq`; preview reports counts and bytes from heads.
  Bodies go in the proto `transport` module.
  `PROTOCOL.md` §Push outcomes and §Sender sequence get the atomic batch, `stamp_ahead`, and the rule for a seq at
  or below high-water without a receipt.
  Constraints: no existence, schema, or delete rules yet (items 4 and 5); deletes are refused with `400` until item 5.
  Done when: tests cover:
  - `seq` per lane: hot and cold advance independently;
  - an update beating the head by HLC, and by device on a tied HLC; an equal stamp `stale`;
  - a second create and a duplicate immutable row, both `stale`;
  - a replay after a lost reply returning the same outcome with `replayed = true`;
  - `seq_reused` for a different digest and for a seq below high-water with no receipt;
  - a stamp exactly 5 minutes ahead accepted, and one millisecond more failing with nothing consumed;
  - a superseded version gone while its head stays;
  - out-of-order seqs, a bad header, and a batch past each cap, all consuming nothing;
  - receipts read by another device of the space.
  Commit: Accept pushed envelopes with sender sequences and receipts
  Depends on: 1

- [ ] 4. Check parents, refs, and write schema on push
  Goal: push checks existence as `PROTOCOL.md` §Cascades by ancestry and header refs states:
  - a create or immutable row whose `parent` has no create, and is not an earlier create in the same batch, is
    `existence`;
  - an update of an entity with no create is `existence`;
  - an envelope whose `parent` disagrees with its entity's create is `existence`;
  - a hard ref naming an id with no create is `existence`; soft `attachment_ids` never block.

  The space's `write_schema` per kind gates writes:
  - a schema above it fails the whole push with `schema_read_only`, consuming nothing;
  - a schema below it is `held { schema }`.
  The server records each held create by sender.
  A later envelope from that sender whose id, parent, or hard ref names that entity is `held { dependency }`.
  The record clears once that sender's create of the entity is applied.
  A storage function sets `write_schema`; tests call it, and the operator command will.
  `PROTOCOL.md` gets the `held { dependency }` rule and `schema_read_only` failing the whole push.
  Constraints: dead parents and refs belong to item 5; the server still decodes no payload.
  Done when: tests cover:
  - one table over the `existence` cases, including a parent created earlier in the same batch;
  - a write below a raised `write_schema` held, and one above it failing with nothing consumed;
  - `held { dependency }` for a child, an update, and a pointer naming a held create, and clearing once that create is
    applied;
  - a card naming an attachment the server never saw, `applied`.
  Commit: Check parents, refs, and write schema on push
  Depends on: 3

- [ ] 5. Apply deletes as fences and answer which ids a space knows
  Goal: a delete records a tombstone and a `deleted_ids` fence, and appends the tombstone at the next hot `seq`.
  In the same transaction it removes the heads and versions of the entity and its descendants, and fences them:
  - a deck: its cards and their reviews;
  - a card: its reviews;
  - a template: the cards whose create names it in `refs.template_id`, and their reviews;
  - an algorithm: nothing else; revisions have no parent.
  A delete of an id the server does not hold is `applied` as a fence; a second tombstone is `stale`.

  Push outcomes for dead entities:
  - a write to a fenced or tombstoned id is `fenced`;
  - a create or immutable row whose parent is dead is `dependency_fenced { drop_entity }`;
  - a card create naming a dead template is `dependency_fenced { drop_entity }`;
  - a pointer group naming a dead referent is `dependency_fenced { repair_pointer }`.

  `POST /v1/spaces/{space}/ids/known` takes a capped chunk of `(kind, id)` pairs and returns the ones the space holds,
  each marked `live` or `fenced`.
  An id is fenced when it or an ancestor is tombstoned or in `deleted_ids`.
  Bodies go in the proto `transport` module; `PROTOCOL.md` gets the two `dependency_fenced` rules and the
  `ids/known` body.
  Constraints: one transaction per delete (chunking is out); algorithm revisions survive their algorithm.
  Done when: tests cover:
  - a deck delete removing its cards' and reviews' heads, then `fenced` for a card update and
    `dependency_fenced { drop_entity }` for a review of a removed card;
  - a template delete dropping the cards that use it;
  - an algorithm delete keeping its revisions, and a `decks.algorithm` write naming it getting `repair_pointer`;
  - a delete of an unknown id, then a create of it `fenced`, and the reverse order ending deleted too;
  - a second tombstone `stale`;
  - one `ids/known` table: live, tombstoned, a card under a deleted deck, and an unknown id; and a chunk past its cap.
  Commit: Apply deletes as fences and answer which ids a space knows
  Depends on: 4

- [ ] 6. Serve pulls per lane
  Goal: `GET /v1/spaces/{space}/pull?lane&after&max_seq&limit` returns entries with `after < seq <= max_seq` in `seq`
  order, the caller's own entries excluded.
  Each entry carries `seq`, `sender`, `sender_seq`, and the envelope bytes.
  The response has `scanned_through`: the highest seq examined, counting own entries and compacted holes.
  It also has `has_more`; `meta` carries the heads and epoch.
  `limit` has a cap, and the page also stops at a byte cap.
  The server records the caller's cursor per lane, for GC later.
  Bodies go in the proto `transport` module; `PROTOCOL.md` gets the pull body and cursor recording.
  Constraints: read-only apart from the cursor; it never waits on the writer lock for longer than one read.
  Done when: tests cover:
  - own entries skipped while `scanned_through` passes them;
  - a page of only holes coming back empty with progress;
  - `max_seq` bounding a cold pull, and `limit` setting `has_more`;
  - a tombstone delivered while its removed descendants are not;
  - two devices exchanging a grade, with scheduling in `hot` and the review in `cold`.
  Commit: Serve pulls per lane with a scan cursor
  Depends on: 5

- [ ] 7. Bootstrap from snapshot leases
  Goal: `POST /v1/spaces/{space}/bootstrap` opens a lease over every live head.
  It returns the snapshot id, page tokens per lane, counts per kind, a byte estimate, the TTL, the absolute expiry,
  and the pinned lane heads.
  `GET /v1/spaces/{space}/bootstrap/{snapshot}?lane&page` streams the snapshot with the same entry fields as pull,
  own sender included:
  - `hot` streams referents first: algorithms, algorithm revisions, templates, decks, cards, then
    `settings.learning`, each kind in `seq` order;
  - `cold` streams newest first by `(hlc, stamp_device, seq)`.
  `POST .../heartbeat` extends the TTL up to the absolute expiry; `DELETE` releases the lease.
  Admission:
  - one lease per device: opening another releases the old one;
  - space-wide caps on open leases and on their bytes (`429`);
  - an expired or released lease is `410 lease_expired`.
  Compaction and deletes keep every version a lease pins until release or expiry, then sweep it.
  TTL, lifetime, and caps are constants; expiry reads the injected clock.
  Bodies go in the proto `transport` module; `PROTOCOL.md` gets the bodies, admission, and `lease_expired`.
  Constraints: the snapshot holds live heads only; tombstones reach the device through catch-up pulls.
  Done when: tests cover:
  - an algorithm created after a deck streaming before that deck;
  - `cold` newest first, and own entries included;
  - a lease taken before an update serving the old version, while pull serves the new one;
  - a lease taken before a deck delete still serving its cards;
  - heartbeat not extending past the absolute expiry, and the TTL at its limit and one millisecond past;
  - a second lease for one device releasing the first, and the lease cap at its limit and one past;
  - release sweeping superseded versions it pinned.
  Commit: Bootstrap from snapshot leases that pin live heads
  Depends on: 6

- [ ] 8. List, revoke, and fork devices
  Goal: `GET /v1/spaces/{space}/devices[/{id}]` returns the fields `PROTOCOL.md` §Devices lists.
  `rebase_required` stays false until stale marking exists.
  Any device of the space can revoke another with `DELETE .../devices/{id}`; `DELETE` of itself is detach.
  A revoked device gets `401 revoked` on every call.
  Its unclaimed pairing codes stop working and its lease is released.
  `POST .../devices/fork` with a current token returns a new device id and token in the same space.
  The new record notes the device it forked from and starts with no sender progress; the old token keeps working.
  Every authenticated request updates `last_seen` from the injected clock.
  Bodies go in the proto `transport` module; `PROTOCOL.md` gets the device and fork bodies.
  Constraints: the 24-hour staleness of a forked-from record is out (stale marking).
  Done when: tests cover:
  - revoke giving `401 revoked` with the epoch, the revoked issuer's code failing to claim, and its lease gone;
  - detach of self;
  - a fork whose token works while the old one still does, whose `last_sender_seq` starts at zero, and whose
    pushes carry its own sender;
  - a device of another space unable to revoke;
  - `last_seen` following the manual clock.
  Commit: List, revoke, and fork devices
  Depends on: 2, 3

## Outcome
