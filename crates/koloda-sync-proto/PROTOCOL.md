# Sync protocol

The contract between the sync engine on native devices and the sync server.
Update this file in the same change as any code that implements it.
This crate implements the wire half: the registry, the clock, and the codecs.

Clients are native only: the desktop app now, React Native later.
The web host does not sync.

## Constraints

| Constraint | Value |
| --- | --- |
| Store | A self-hosted server, easy to deploy; not user-provided cloud storage |
| Server language | Rust |
| Payload visibility | Plaintext now; end-to-end encryption (E2EE) must be addable without a redesign |
| Sign-in | No accounts; device pairing codes |
| Latency | Local-first; sync as soon as possible when online |
| Scale | Personal scale for most users; must handle 500k+ cards and tens of millions of reviews |
| Sharing between people | Not planned |

## Overview

A server stores one compacted log of **envelopes** per **space**.
An envelope is one write to one **field group** of one entity, stamped with a hybrid logical clock (HLC).
The server reads the envelope header and never the payload.
Merge is per field group, last-writer-wins (LWW) by HLC, with delete-wins tombstones and a repair pass for pointers
whose referent dies.
Card content, card scheduling, and card reset are separate groups.
An edit, a grade, and a reset therefore never share a register.
Every referenced kind opens with an immutable `create` envelope.
Attachments travel outside the log, by content address.
A space is created once; other devices join it with a short-lived pairing code.

## Trust model

A space belongs to one person.
Every enrolled device is that person's device.

The server defends against:

- callers without a valid token (pairing-code guessing, space creation without the setup token);
- revoked devices (their tokens stop working, they stop pinning GC);
- client bugs (existence checks, header allowlists, schema gates, limits);
- resource exhaustion (body, envelope, and space size limits).

The server does **not** defend against an enrolled device that lies.
An enrolled device may push a write whose `stamp_device` is another device.
It may republish another device's head during recovery, and read any sender's push receipts.
A stolen device is revoked from any other device.

Defending against a lying enrolled device would buy little.
Such a device can already publish valid tombstones for every deck, and delete-wins makes that terminal.
No receipt rule can tell a malicious delete from a real one.
The remedy for a device gone bad, or a bug that deleted too much, is revocation plus an authoritative server restore
(§Recovery): devices re-bootstrap from the backup instead of re-pushing what they hold.

A household sharing one server uses one space per person.
Sharing decks between people would need its own trust model; this one does not stretch to it.

## Topology and server state

Hub and spoke.
Devices never talk to each other.
One server, many spaces.
A device belongs to exactly one space.
A device is an enrolled database file, not a machine; two profiles in one install are two devices.

The server is authoritative for **order**, **membership**, and **existence fences**.
It is not authoritative for **meaning**.

What the server stores per space, in one database per space:

- `entry_versions`: immutable accepted envelope bytes, digest, and assigned lane `seq`.
  A version remains while a head or a snapshot lease references it.
- `entry_heads`: one live version per `(kind, id, group)`, compacted by moving the head reference.
  The head is the highest `(hlc, stamp_device)`.
  A pushed envelope that does not beat the head is `stale`.
  Immutable groups are never superseded; a duplicate is `stale` too.
- `tombstones`: one row per deleted entity, kept until every active device has passed it.
- `deleted_ids`: permanent fence of tombstoned entity ids, kept after tombstone GC.
- `deletion_scopes`: logical dead closures committed with a tombstone before physical chunk cleanup.
  Pulls, snapshots, and head installation treat a covered entity as absent immediately.
- `snapshots` plus `snapshot_items`: short-lived bootstrap leases (§Transport).
- `sender_progress` and `sender_receipts`: per-sender high-water and the immutable outcome of every consumed
  `(sender, sender_seq)`.
- `write_schema` per kind, and the accumulated restore points.
- `attachment_refs`: which attachment ids each live card links (§Attachments).

For a newly consumed `(sender, sender_seq)`, one transaction in the space database commits its digest and outcome,
the sender high-water, and any version, head, tombstone, fence, or lane `seq` it produced.
The response is sent only after commit.
Correctness never depends on a transaction spanning two databases.

What the server reads: `kind`, `id`, `parent`, `refs`, `group`, `op`, `hlc`, `stamp_device`, `schema`, `commit_id`,
the authenticated `sender` from the bearer token, and `sender_seq` on the push item.
What the server never reads: `payload`.

That boundary makes E2EE a later change to the payload codec and key distribution, not to the protocol.
The header stays plaintext, so the server always sees the graph.
It sees how many entities of each kind exist, which card sits in which deck, and which template and attachments a
card uses.
It sees when each was written or deleted.
It never sees titles, fields, content, notes, or parameters.
When payloads become ciphertext, the header bytes are AEAD associated data.

Capture builds the header and payload from the same row values.
Payload foreign keys therefore equal header `parent` and `refs` by construction.
That is a codec invariant covered by conformance tests, not a runtime check on apply.

## Envelope encoding

An envelope is a CBOR map of two byte strings, `header` then `payload`.
The header is itself CBOR, carried as bytes so it reaches the receiver unchanged.
Under E2EE those exact bytes are the AEAD associated data.

The header is a CBOR map with these keys, in this order; optional keys are omitted when absent:

| Key | Value |
| --- | --- |
| `kind` | Kind string (§Field groups and merge) |
| `id` | Entity id string |
| `parent` | Parent id string; present exactly when the kind has a parent |
| `refs` | Map of `algorithm_id`, `template_id` (strings), and `attachment_ids` (array of strings); omitted when empty |
| `group` | Group string; present on writes, absent on deletes |
| `op` | `write` or `delete` |
| `hlc` | Raw 64-bit HLC (§Clocks and order) |
| `stamp_device` | 16 raw UUID bytes |
| `schema` | Payload schema version of the kind (§Schema versions) |
| `commit_id` | 16 random bytes shared by one commit |

Unknown keys are rejected.
One logical header has one encoding: `attachment_ids` are sorted and unique, and an empty `refs` map is omitted.
The digest is the SHA-256 of the encoded envelope bytes.

Decoding validates the header against the registry:

- the kind, group, and op are known, and the group belongs to the kind;
- a write names a group, and a delete names none and targets a kind with tombstones;
- `parent` is present exactly when the kind has a parent;
- a write carries every hard ref of its group and no ref its group lacks; a delete carries no refs.

Limits: a header is at most 16 KiB and a payload at most 512 KiB.
Every field decodes into a fixed type, so nesting depth is bounded without a separate limit.

## Payloads

A payload is a CBOR map whose shape the header's kind, group, and `schema` decide.
Every kind is at schema 1.
Optional values are encoded as null, except a delete's `successor`, which is omitted when absent.
Unknown keys are rejected.
JSON columns travel as the JSON text the row stores: card content, template structure, algorithm parameters,
a revision's actor, and each learning-settings value.

| Kind / group | Payload keys |
| --- | --- |
| `cards` / `create` | `deck_id`, `template_id`, `content`, `scheduling` (the scheduling map below), `created_at`, `initial_product_ts`, `legacy_product_ts_floor` |
| `cards` / `content` | `content`, `updated_at` |
| `cards` / `scheduling` | `state`, `due_at`, `stability`, `difficulty`, `scheduled_days`, `learning_steps`, `reps`, `lapses`, `last_reviewed_at` |
| `cards` / `reset` | `wall_ms` |
| `reviews` / `row` | `card_id`, `rating`, `state`, `due_at`, `stability`, `difficulty`, `scheduled_days`, `learning_steps`, `time`, `is_ignored`, `created_at` |
| `decks` / `create` | `title`, `notes`, `created_at`, `initial_product_ts`, `legacy_product_ts_floor` |
| `templates`, `algorithms` / `create` | `title`, `notes`, `content`, `created_at`, `initial_product_ts`, `legacy_product_ts_floor` |
| `decks`, `templates`, `algorithms` / `title` | `title`, `updated_at` |
| `decks`, `templates`, `algorithms` / `notes` | `notes`, `updated_at` |
| `templates` / `structure`, `algorithms` / `content` | `content`, `updated_at` |
| `decks` / `algorithm` | `algorithm_id`, `updated_at` |
| `decks` / `template` | `template_id`, `updated_at` |
| `algorithm_revisions` / `row` | `algorithm_id`, `content`, `actor`, `created_at` |
| `settings.learning` / `defaults.algorithm` | `algorithm_id` |
| `settings.learning` / `defaults.template` | `template_id` |
| `settings.learning` / `dailyLimits`, `dayStartsAt`, `learnAheadLimit` | `value` |
| any kind / delete | `successor` (algorithms only) |

`updated_at` in a payload is that group's product timestamp; the receiver stores it as the register's `product_ts`.
`initial_product_ts` maps group names to the product timestamps of the synthetic registers a create writes.
A group absent from the map starts with a null `product_ts`.

### Sealing

The writer seals a payload into an envelope:

1. Kind, group, and op come from the payload's type.
2. `parent` comes from the payload when it carries its parent: `deck_id` on a card create, `card_id` on a review.
   Card updates and card deletes carry no deck, so the writer passes the deck from the row.
   A given parent that disagrees with the payload's is an error.
3. `refs` come from the payload: algorithm and template pointers, and the card's template on create.
   Attachment ids are every `attachment:<64 lowercase hex>` link in the card's content text, sorted and unique.
   A hex id cannot be hidden by JSON escaping, so the text scan finds every link without parsing.
4. The header and payload are encoded, decoded back, and compared with the input.
   A mismatch fails the write before anything is queued.

Only algorithm deletes carry a `successor`.
A receiver that meets a schema it does not know decodes nothing and holds (§Schema versions).

## Identity

### Primary keys

| Table | Key | Notes |
| --- | --- | --- |
| `algorithms`, `templates`, `decks`, `cards`, `reviews`, `algorithm_revisions` | UUIDv7 string | Client-minted |
| `attachments` | Lowercase hex SHA-256 of the bytes | Equal bytes are the same attachment everywhere |
| `settings` | Name | Sync id for the learning document is `learning` |
| `conversations` | UUID | Device-local; not synced |

UUIDv7 exposes creation time inside the id; that is accepted for a personal study store.
The wire `id` is a string, so settings documents and attachment hashes fit the same header.
Template field ids are client-minted UUID strings.
Learning defaults store algorithm and template ids as strings.

### Seed identity

Native first run inserts one algorithm (`SEED_ALGORITHM_SIMPLE_ID`) and one template (`SEED_TEMPLATE_TYPE_ID`),
with fixed field ids.
This document calls them **the seed algorithm** and **the seed template**.
The other seed constants are web-demo only.

Seed rows follow the same deletion rules as every other row.
Repair never depends on them: a dead pointer moves to its kind's repair target (§Deletes).

Two devices that set up independently hold the same starter rows under the same ids.
An unmodified seed row on a joining device carries stamp zero and is never pushed.
The joiner therefore cannot overwrite the space's copy; the space's `create` **overlays** it on apply.

Seed ids are the one exception to ids being minted once: every first run mints them again.
A space may have deleted, and so fenced, a seed id that a joiner still holds.
A joiner therefore keeps a seed id only while the space holds it live (§Joining).

## Field groups and merge

### Groups

A field group is the unit of merge: one envelope, one stamp, one last-writer-wins register.
Writes to different groups of the same entity never conflict.
Every envelope carries a random `commit_id`.
All envelopes captured by one local transaction share it and one stamp.

The header `op` is `write` or `delete`.
A write names one group of its kind; the group's class decides whether it creates, updates, or inserts.
A delete names no group and tombstones the whole entity.
Only cards, decks, templates, and algorithms have deletes.
Kinds, groups, ops, and lanes travel as the strings in the tables below.

| Kind | Group | Class | Columns | Lane |
| --- | --- | --- | --- | --- |
| `cards` | `create` | create | Whole row as inserted, including `deck_id` and `template_id` | hot |
| `cards` | `content` | update | `content`, `updated_at` | hot |
| `cards` | `scheduling` | update | `state`, `due_at`, `stability`, `difficulty`, `scheduled_days`, `learning_steps`, `reps`, `lapses`, `last_reviewed_at` | hot |
| `cards` | `reset` | update | `wall_ms` (display time of the reset) | hot |
| `reviews` | `row` | immutable | Every column | cold |
| `decks` | `create` | create | Whole row as inserted, except `algorithm_id` and `template_id` | hot |
| `decks` | `title` | update | `title`, `updated_at` | hot |
| `decks` | `notes` | update | `notes`, `updated_at` | hot |
| `decks` | `algorithm` | update | `algorithm_id`, `updated_at` | hot |
| `decks` | `template` | update | `template_id`, `updated_at` | hot |
| `templates` | `create` | create | Whole row as inserted | hot |
| `templates` | `title` | update | `title`, `updated_at` | hot |
| `templates` | `notes` | update | `notes`, `updated_at` | hot |
| `templates` | `structure` | update | `content` (fields, layout), `updated_at` | hot |
| `algorithms` | `create` | create | Whole row as inserted | hot |
| `algorithms` | `title` | update | `title`, `updated_at` | hot |
| `algorithms` | `notes` | update | `notes`, `updated_at` | hot |
| `algorithms` | `content` | update | `content` (parameters), `updated_at` | hot |
| `algorithm_revisions` | `row` | immutable | Every column | hot |
| `settings.learning` | `defaults.algorithm` | update | Algorithm id inside defaults | hot |
| `settings.learning` | `defaults.template` | update | Template id inside defaults | hot |
| `settings.learning` | `dailyLimits`, `dayStartsAt`, `learnAheadLimit` | update | That key, one group each | hot |

Who writes what:

- A card edit writes `cards.content`.
- A grade writes `cards.scheduling` and a `reviews` row in one commit.
- A reset writes `cards.reset` and blank `cards.scheduling` in one commit (§Deletes).
- A deck create writes `decks.create`, `decks.algorithm`, and `decks.template` in one commit.
- An algorithm create, or a save that changes parameters, writes the matching `algorithm_revisions` row in the
  same commit.
  Applying a remote `algorithms.content` never records a local revision.
  The remote device's revision arrives as its own envelope.
- An edit form that saves several columns emits only the groups whose values changed.
  A save that changes nothing emits nothing.

### Classes

- **create**: insert if absent, else drop.
  The exception is a local stamp-zero seed row, which is overlaid (replaced as if inserting).
  Never superseded, never compacted away.
- **update**: never inserts.
  Dropped if the row is absent.
- **immutable**: insert if absent and the parent is live, else drop.

There is no upsert class.
A compactable upsert must not appear in `refs`.
Compaction could leave a dependent `create` at a lower `seq` than the referent's current head.
A `seq`-ordered snapshot would then meet the dependent first.

`algorithm_revisions` has no parent and no refs.
Its `algorithm_id` is a soft reference in the payload.
It may name a deleted algorithm, and an algorithm tombstone never cascades to it.
That matches the product rule that history outlives its algorithm.

`settings.learning` is never inserted by sync.
Every device seeds the document locally at stamp zero, so its groups are only ever updates.

### Existence and order

Cards, decks, templates, and algorithms each have an immutable `create`.
It is written once, never superseded, and never compacted away.
It is therefore always the entity's lowest `seq` and arrives before any update to that entity.

On insert, a create stamps every update group with its own HLC and `synthetic = 1`.
That includes `cards.reset`, with no reset applied.
Those synthetic registers take `product_ts` from the create payload's `initial_product_ts` map, never from
receive time.
Same-commit envelopes (deck pointers; a reset's blank scheduling) share that stamp.
They apply because **equal plus synthetic** counts as a win; then `synthetic` clears.
After that, equal stamps do not beat.

Deck create carries no algorithm or template.
Local SQLite still stores real foreign keys.
On remote insert they are filled with placeholders: each kind's repair target (§Deletes).
The same-commit pointer groups then overwrite them.
A later delete of the deck's birth algorithm therefore cannot make a fresh bootstrap drop the deck.
If a pull page splits a deck's create from its pointers, the deck briefly sits on its placeholders.
A placeholder pointer is local only; it is never captured.
Repair must not publish until catch-up (§Transport).

A device normally holds a live algorithm and template whenever a deck create arrives.
During bootstrap, both kinds stream before decks (§Transport).
After that, product rules keep at least one of each on the device, and repair recreates one if concurrent deletes
kill the last.
The exception is bootstrapping a space that concurrent deletes have emptied of a kind.
The placeholder is then a new default row, which is captured like any repair.

### Registers

The register behind each mutable group is a row in the client's `sync_stamps` table.

| Column | Notes |
| --- | --- |
| `kind`, `id`, `group` | Primary key |
| `hlc`, `stamp_device` | Stamp of the write currently applied; `stamp_device` breaks HLC ties and never changes for that write |
| `sender`, `sender_seq` | Who pushed this head and under which sequence; from pull metadata, or from the outbox for local writes; restore cutoff key |
| `product_ts` | Winning envelope's product timestamp for this group, or null |
| `synthetic` | Set when a create wrote this stamp as a floor |

Immutable creates and reviews have a `sync_origins` row with the same stamp and sender columns.
A create's row also holds its `legacy_product_ts_floor` when it has one.
No wire bytes are kept after push.
A re-push after server restore re-encodes from the row and registers with the stored stamp.
For a create, that means current values and current `product_ts` as its initial values.
Every later change has its own head that applies on top, so the replica ends in the same state.
A duplicate create is `stale` whatever its digest.

Every capture writes the entity row, the encoded envelope, the stamp or origin, and the outbox slot in one
transaction.
Every remote apply writes rows, stamps, and the cursor in one transaction.

### `updated_at`

`updated_at` on the row is derived.
Each group that carries it stores its winning value as `product_ts` on its register.
Applying a winning envelope **replaces** that group's `product_ts`.
The column is `max(product_ts)` across the entity's registers.
A losing replica therefore does not keep a higher timestamp from a losing write.

Contributing groups:

- `cards.content`;
- every deck group except `create`;
- `title`, `notes`, and `structure` or `content` for templates and algorithms.

`cards.scheduling` and `cards.reset` never contribute, so a grade or reset never looks like an edit.
A pre-sync entity may have a legacy `updated_at` that cannot be attributed to a group.
Its create carries that value as a `legacy_product_ts_floor`.
The column is then the max of that floor and current contributions.

### Apply rule

For every incoming envelope, in order:

1. If the entity or an ancestor is tombstoned locally or the id is fenced, drop it.
2. Decode the payload.
   If it does not decode, follow §Transport (Corrupt envelopes).
3. If `parent` or `refs` name a tombstoned referent, follow §Deletes (Arrivals) before writing.
   If they name a missing (not tombstoned) entity, drop.
   Do not invent a row; do not repair-publish.
4. Delete: record the tombstone and fence the id.
   For a template or algorithm, sweep pointers first (§Deletes).
   Then delete the entity and its descendants, with their stamps, origins, and pending local rows.
   Done.
5. Immutable: a review is compared with `cards.reset` only when that register is non-synthetic.
   If it does not strictly beat it, drop.
   Otherwise insert if absent and the parent is live, and write `sync_origins`.
   Done.
6. Create: insert if absent, else drop, except a stamp-zero seed row, which is overlaid.
   On insert or overlay, stamp every update group (synthetic) and write `sync_origins`.
   Done.
7. Update for an absent row: drop.
8. Compare with the register.
   Less: drop.
   Equal and not synthetic: drop.
   Equal and synthetic, or greater: apply.
9. Apply the payload and `product_ts`, recompute `updated_at`, and write the register with `synthetic = 0`.
   Delete any **not-in-flight** pending outbox row for the same group.
   An in-flight row stays until its outcome arrives; the server returns it as `stale`.
   A winning `cards.reset` also blanks `cards.scheduling` at its stamp unless scheduling already beats it.
   It deletes the reviews that do not strictly beat it, with their origins and pending local rows.
   A winning `cards.content` enqueues fetches for attachments it links that are not local (§Attachments).

Step 9 discards a pending local write because pushing it would republish remote content under a losing stamp.
If the local stamp wins in step 8, the pending row stays and pushes as normal.

The server runs the same comparison on headers, so losers never reach other devices.
The client runs it because it must be correct against any server, and it alone sees pending local writes.

### Collision outcomes

| Collision | Outcome |
| --- | --- |
| Edit card text on A while B grades it | Both survive; different groups |
| Two devices grade the same card offline | Both reviews are kept; scheduling is the later grade's, computed from its own base |
| Reset on A, grade on B before the reset | Reset writes blank scheduling and `cards.reset` at stamp R; R beats G, so scheduling is blank and B's review dies |
| Reset on A, grade on B after the reset | B's grade wins scheduling by stamp; its review beats the reset stamp and survives |
| Tied HLC reset vs grade | One total order on `(hlc, stamp_device)` across all four envelopes; never mixed |
| Delete deck on A, add or edit a card in it on B | Delete wins; the card is dropped and fenced everywhere |
| Rename a deck on A, edit its notes on B | Both survive; different groups |
| Rename an algorithm on A, change its parameters on B | Both survive; both devices' revisions are kept |
| Two devices change the same algorithm's parameters | Later stamp wins `content`; both revisions are kept |
| Delete an algorithm on A, change its parameters on B | Delete wins; both devices' revisions survive |
| Algorithm successor on A vs deck still pointing at the old algorithm on B | Only `decks.algorithm` is repaired or LWW'd |
| Two devices edit template structure concurrently | Last writer wins on `structure`; orphan keys in card content are ignored by the renderer |
| Two devices add the same image | Same attachment id; one upload is enough |
| Two devices each delete a different algorithm while others remain | Both deletes win; pointers repair to the `successor`, else the lowest live id |
| Two devices each delete one of the last two algorithms | Both deletes win; every device creates a default algorithm when its last one dies; decks and learning defaults converge by LWW, and unused defaults stay as ordinary rows |

The template structure row is the only accepted lossy case, bounded by what one offline session can edit.
The engine reserves a per-kind **merge hook** for a group that has both a pending local and an incoming remote
envelope.
A union-by-field-id merge for `templates.structure` is a candidate for that hook.

## Deletes

### Tombstones

The product schema keeps no soft-delete column.
Deletion records a local fence and a `sync_tombstones` row, then publishes `op = Delete`.
The cascade deletes reviews, cards, then the root in the same transaction.
That holds for a local delete and for an applied remote tombstone.
A tombstone is terminal: no later create or update of that entity applies, regardless of stamp.

Very large deletes may later move to chunked `sync_delete_jobs` that run under a maintenance budget.
Repository reads would then treat an active deletion scope as absent while physical descendants remain.
That changes when rows are physically removed, not what is logically dead.

### Cascades by ancestry and header refs

Every envelope of a card carries `parent = deck`; every review carries `parent = card`.
The parent is the one written at `create` and never changes.

| Kind / group | `parent` | `refs` |
| --- | --- | --- |
| `decks` / `algorithm` | none | `algorithm_id` |
| `decks` / `template` | none | `template_id` |
| `cards` / `create` | deck | `template_id`, `attachment_ids` |
| `cards` / `content` | deck | `attachment_ids` |
| `cards` / other groups | deck | none |
| `reviews` / `row` | card | none |
| `settings.learning` / `defaults.algorithm` | none | `algorithm_id` |
| `settings.learning` / `defaults.template` | none | `template_id` |
| everything else | none | none |

An entity is dead if it or an ancestor is tombstoned, or its id is in `deleted_ids`.
`attachment_ids` are **soft** refs: they never block a push and never cascade (§Attachments).

The server checks hard refs and parents on push:

- A `create` or immutable whose `parent` is not live, and is not an earlier `create` in the same push batch:
  `existence`.
- An update whose entity has no live `create`: `existence`, or `fenced` if the id is in `deleted_ids`.
- A delete of an id the server does not hold: `applied` as a fence.
  The id goes into `deleted_ids`, and a later create of it is `fenced`.
  Ids are unique, so fencing an unknown one blocks nothing legitimate.
  A heal re-push of a tombstone therefore cannot lose a race with another device's re-push of the create.
  Seed ids are the exception to uniqueness; a fenced one blocks only a joiner's local starter row, which joining
  deletes or remints (§Joining).
- An envelope whose `parent` disagrees with the entity's `create`: `existence`.
- An envelope whose hard `refs` name an absent id that is not known dead: `existence`.
  The sender must already have pushed the referent; this is a client bug, not a repair case.
- Before installing a winning head, the server revalidates parent and refs under the space writer lock.
  A dead parent is `dependency_fenced { action: drop_entity }`.
  A card create naming a dead template is `dependency_fenced { action: drop_entity }` too, because a card cannot
  leave its template.
  A dead pointer in an update group is `dependency_fenced { action: repair_pointer }`.
  No head is installed.

Deleting a deck publishes **one** tombstone.
The server fences the deck and commits a logical deletion scope over descendant card and review ids.
It then chunk-removes their heads and records their fences.
Deleting a card does the same for its reviews.
Deleting a template also drops and fences cards whose `refs.template_id` names it.
Reviews never get tombstones of their own.
Card ids are fenced; reviews need no fence, because their card's fence already refuses them.
A tombstone for an id already fenced, by its own tombstone or a cascade, is `stale`.
A 50k-card deck delete is a single envelope: the server removes it in chunks, and a device in one transaction.

A card's `deck_id` and `template_id` are fixed at creation and never appear in an update group.
That is what makes the cascade by ancestry a single envelope (`docs/decisions/FIXED-CARD-PARENTS.md`).

### Reset progress

One local commit publishes two envelopes at the **same** `(hlc, stamp_device)`:

- `cards.reset` with payload `{ wall_ms }`;
- `cards.scheduling` with the wiped columns, the same values the product reset writes.

Every review stores its origin stamp in `sync_origins`.
A card has a review cutoff only when its `cards.reset` register is non-synthetic.
Then a review is dead if its origin stamp does not **strictly beat** the reset stamp.
Equal HLC with a losing device id counts as before the reset.
Because blank scheduling shares the reset stamp, one comparison decides both registers.

Applying a winning reset also writes blank scheduling at the reset stamp unless scheduling already beats it.
That covers a reset arriving before its paired scheduling envelope.

A reset's `wall_ms` is display data and never a merge key.
The product stores it only once a feature shows reset time.
Reset stays O(1) on the wire for a card with thousands of reviews.

### Referents are not parents

Templates and algorithms are referenced, not owned.
Applying a template or algorithm tombstone sweeps **tombstoned** pointers, never missing ones:

- decks and learning defaults pointing at a dead algorithm or template are repaired to that kind's repair target;
- cards pointing at a dead template are dropped with their reviews (the server has already fenced them);
- only then is the referent row deleted.

A kind's **repair target** is the first of:

1. the tombstone's `successor` hint, if it names a live algorithm;
2. the live row of that kind with the lowest id;
3. a new default row: the starter content first run writes, under a fresh id, captured as a local create (an
   algorithm with its revision).

The lowest id is a fixed pick, not an order (ruling 2): devices that hold the same live rows pick the same target.
Step 3 runs only when no live row of the kind is left.
Product rules keep at least one algorithm and one template on each device.
Two devices that each delete one of the last two rows still kill both.
Every device then creates its own default when its last row dies, so the space can end with several.
They are ordinary rows.

Repair writes one group and does not rewrite the sibling pointer.
Repair touches only a dead pointer and publishes like any other write.
A pointer that is already live, because another device's reassignment arrived first, is left alone.
The deleting client normally publishes its explicit reassignments before the tombstone.

After catch-up, a learning default that names no live row is repaired to its kind's target as well.
That covers a joiner's stamp-zero defaults naming a seed id the space does not hold.
After catch-up, a missing referent cannot still be in flight: its create sits below every pointer to it.

### Arrivals

| Situation | Resolution |
| --- | --- |
| Card or review arrives, parent tombstoned or fenced | Dropped; delete wins |
| Card or review arrives, parent absent | Dropped; the server already refused it |
| Update arrives, row absent | Dropped; updates never insert |
| Pointer or card create names a tombstoned algorithm or template | Repair the pointer, or drop the card |
| Pointer or card create names a missing algorithm or template | `existence` on the server; the sender drops or recaptures locally |
| Card content names an attachment this device lacks | Applied; the attachment is fetched |
| Revision names a deleted or absent algorithm | Inserted; soft reference |

`deleted_ids` outlives tombstones, so a bootstrap after tombstone GC cannot resurrect a fenced id.
There is no restore of deleted entities.

## Clocks and order

### Hybrid logical clock

Every envelope carries a 64-bit HLC: 48 bits of wall milliseconds above 16 bits of counter.
The raw value therefore orders like the clock.
Ties break on `stamp_device`, compared as its 16 raw UUID bytes.
One HLC per commit; every envelope of a local transaction shares it.
On counter overflow the wall part advances one millisecond.
The device persists its last HLC, never issues a smaller one, and advances past every stamp it applies.
The one exception is a re-stamp (§Cohorts), which may set the last HLC below where a clock set ahead left it.
It never issues below the **stable high-water**: the highest stamp the device applied or had consumed by a push.
Nor does it issue below a cohort that went out and may yet be consumed.
The clock therefore only goes back over stamps that `local` cohorts alone held.

### Skew guards

- Every server response carries server time.
  The client updates its skew estimate before applying the response.
- The skew estimate is server time minus local time when a reply arrives.
- If skew exceeds 5 minutes either way the client pauses (no push, no apply), and re-stamps once the clock is
  corrected.
  The pause is recorded where the cycle stops, and the record outlives a relaunch.
  The first cycle whose reply shows a skew inside the tolerance re-stamps every `local` cohort (§Cohorts) before it
  pushes or applies anything, and clears the record.
- The server rejects an envelope whose wall part is more than 5 minutes ahead of **server now**.
  The whole push then fails with `stamp_ahead` and consumes nothing, so its cohorts return to `local`.
  The client re-stamps them once and pushes again; a second `stamp_ahead` in the same cycle stops it.
  A space that already holds a far-ahead stamp waits for wall time to catch up.

### Cohorts

A cohort is one commit's envelopes.
The client records each cohort's state: `local`, `uncertain`, or `fixed`.
Before any member is transmitted, the cohort becomes `uncertain`.
Push requests never split a cohort, and a push is atomic (§Push outcomes).
A complete response proving no member was consumed returns it to `local`.
Anything else fixes it to its original stamp.

- A push with no complete reply fixes every `uncertain` cohort it carried.
  Its rows stay in flight, and the next push sends the same bytes first.
- A row still in flight when the next batch is picked means the same, as after the app stopped mid-push.
- An error reply consumed nothing.
  Its `uncertain` cohorts return to `local` and their rows leave flight; `fixed` cohorts keep theirs in flight.
- Rows a reply did not reach, after `seq_reused`, leave flight the same way.

Re-stamp walks only `local` cohorts and gives every pending member of a cohort one new stamp in one transaction.
A reset and its blank scheduling can therefore never end up with different stamps.

- The walk is one transaction over every `local` cohort, in old `(hlc, stamp_device)` order.
  A capture between two cohorts would take a stamp below one still waiting.
- New stamps come from the clock at the corrected time, under the file's current device id.
  They start above the stable high-water, every cohort that is not `local`, and the stamps enrollment reserved for
  backfill.
  A re-stamped write therefore still beats every stamp it could have read, including a remote one that it replaced
  in its register.
- A cohort at a reserved backfill stamp is not walked.
  Later batches of the same phase write at that stamp, and moving one batch would break the order between phases.
- Each member's envelope is decoded, given the new header stamp, and encoded again.
  Its payload bytes, `commit_id`, and `sender_seq` stay; its digest is recomputed.
  The register, origin, or tombstone the member wrote moves to the new stamp, a create's synthetic registers
  included.
- The last HLC rests on the last stamp issued.

### Sender sequence

Push idempotency is `(sender, sender_seq)`.
`sender` is the bearer token's device; `sender_seq` strictly increases per device.
For a consumed sequence, a different digest is `seq_reused`.
So is a sequence at or below the sender's high-water that was never consumed: it cannot be this envelope.
The same digest returns the stored outcome with `replayed = true`.

### Pull cursor

The server assigns a per-space, per-lane, strictly increasing `seq` to every accepted envelope.
A head always has both the highest stamp and the highest `seq` in its group.
Compaction therefore removes only lower superseded versions.
A pull from any cursor is complete inside a snapshot lease or against live heads.

`create` survives compaction at the entity's lowest `seq`.
A child's create sits above its parent's.
Referents sit above their referers, because capture of an unstamped entity enqueues its referents first.
Any read in `seq` order therefore inserts a row before any update to it, and a dependency before any dependent.
No envelope is ever buffered waiting for another.

Pull responses return `scanned_through`: the highest seq examined, including own-sender gaps and compacted holes.
The client advances to `scanned_through`, so empty pages are safe.
A page holds at most `limit` entries (1 to 5000, 5000 by default) and about 8 MiB of envelopes.
It always holds the first entry due, so it makes progress.
Pull reads live heads only, so a superseded version or a removed descendant never reaches a device.
Each pull records the cursor it starts from, per lane, on the caller's device record, for GC.

A GC pass removes the tombstones at or below the lowest `hot` cursor of the active devices, and at or below the `hot`
head of every live bootstrap lease, which catches up from it.
An active device is not revoked, not `rebase_required`, and not stale by `last_seen`.
A pass reads staleness itself, without waiting for the device's next call.
The highest seq a pass removed is the lane's **GC horizon**, and it never falls.
`cold` holds no tombstones, so its horizon stays 0.
`deleted_ids` keeps every fence, so a late create of a collected id is still `fenced`.
A pull whose `after` is below its lane's horizon may have missed a collected tombstone.
It is answered `cursor_too_old`, and the device re-bootstraps.
`serve` runs a pass every hour.

### Existing rows at enable time

Enabling sync treats pre-sync data as one imported snapshot.
It never reconstructs order from product timestamps or UUIDv7 time.
Enrollment reserves one stamp per phase, in phase order, and stores them with the scan's watermark:

1. immutable creates (including algorithm revisions) and current non-scheduling groups, in referent and ancestor
   order, then the `learning` document's groups on the device that creates the space;
2. reviews currently present, ordered by `(created_at, id)`;
3. current card scheduling snapshots.

Only the order between phases matters; within a phase, log order orders the rows.
Each batch is one commit and cohort at its phase's stamp.

Pre-sync resets leave no record, and none is needed.
A product reset already deleted the reviews it cut off, so every surviving review is newer than any reset.
A legacy card's reset register is only the synthetic floor from its create, which never cuts off a review.
A legacy card gets a phase-3 snapshot while its scheduling register is still the synthetic floor of its phase-1 create.
Its final scheduling therefore sorts after its reviews.
A card graded or reset since, on this device or another, already holds newer scheduling and gets none.
Allocation never exceeds the absolute server-time cap.
The enrollment transaction moves the device's last HLC to the last reserved stamp.
Every later capture therefore sorts after every phase.

Unmodified seed rows on a joining device get stamp zero and are skipped.
So are the seed algorithm's revisions, which a join deletes (§Joining).

The creator's `learning` groups overlay every joiner's stamp-zero copy, so no joiner stays on the first-run defaults.
A joining device never backfills them (§Joining).

## Devices

| Field | Notes |
| --- | --- |
| `device_id` | UUID minted at enrollment; `sender` on the wire |
| `token` | 256-bit bearer secret; hashed on the server, in the OS secure store on the client |
| `name`, `platform` | User-editable name; `desktop-win`, `desktop-mac`, `desktop-linux`, `ios`, `android` |
| `last_seen`, `cursor_hot`, `cursor_cold` | Maintained by the server |
| `last_sender_seq` | Highest consumed `sender_seq`, and its digest |
| `rebase_required` | Set when the device is stale or its cursor is below a GC horizon |

Rules:

- Any device can list and revoke devices.
  A revoked device gets `401 revoked`, detaches locally, keeps its data, and stops pinning GC.
  It still learns the epoch, so it can tell revocation from a restore that predates it.
  Revoking also ends the device's unclaimed pairing codes and its bootstrap lease.
  A device that revokes itself detaches.
- A device unseen for 90 days is **stale**, and so is a record another was forked from that has made no request for
  24 hours.
  A stale device is `rebase_required`, and it no longer pins GC.
- A request marks its device stale when the stored `last_seen` is past that window.
  It reads `last_seen` before the request refreshes it, and the flag persists.
- The server refuses every push from a device that is `rebase_required` or whose cursor is below a GC horizon
  (`cursor_too_old`).
  The refusal consumes nothing, replays included.
  Receipts, pull, the device calls, and bootstrap still answer, so the device can re-bootstrap first.
- Releasing a snapshot lease clears `rebase_required`, because a device releases only once its snapshot and catch-up
  are applied.
- The space carries an `epoch`: an opaque generation UUID that changes on every server restore.

Detaching on the device deletes the token and records when.
Rows and sync tables stay, and capture keeps recording, for a later re-attach.
A detached file sends no request.
A `401 revoked` reply to any call detaches the file this way; `detach` revokes the own device first.
`401 unknown_device` stops the engine until recovery lands.

### Behind its own record: rollback and copies

A file restored from a backup, and a copied file still using the original's token, look the same to the server.
The file's `next_sender_seq` is not above `last_sender_seq` on its device record, or a seq it sends comes back
`seq_reused`.

The first cycle after launch reads the device record before pushing.
The file is **behind** if any of:

- `last_sender_seq >= next_sender_seq`;
- a pending outbox row that is not in flight has a seq `<= last_sender_seq`;
- `last_sender_seq` is above the highest seq this file saw consumed in a push reply, and the receipts between them
  hold a seq that is not one of this file's rows in flight with the same digest.

A `seq_reused` outcome mid-session means the same thing.
A row in flight was sent before, so its seq proves nothing: its retry is a replay, or it comes back `seq_reused`.
A file that is behind pushes and pulls nothing until it has forked.
Pulling would miss the other copy's writes, because pull excludes the device id both files share.

A file that is behind:

1. Looks up receipts for every pending seq `<= last_sender_seq`.
   Matching digest: that envelope was accepted; apply the stored outcome.
   Different digest or no receipt: that envelope was never accepted.
2. Classifies by cohort, never by envelope.
   A cohort with **any** accepted member is `fixed`.
   Its remaining members keep their original `(hlc, stamp_device)` and are only renumbered.
   The trust model lets the new sender push them.
   A cohort with no accepted member returns to `local`.
   Splitting a cohort here would let a reset's blank scheduling take a newer stamp than its reset.
   It could then beat a grade whose review the reset did not kill.
   A cohort remembers when a push reply consumed one of its members, even after that member left the outbox.
   A cohort that a lost reply fixed, with no member known consumed, returns to `local` when no receipt shows one.
3. Forks: `POST .../devices/fork` with its current token returns a fresh device id and token.
   The request carries a nonce the file stores before it calls.
   The same nonce from the same device returns the same new device with a fresh token.
   A file that stopped before the switch therefore forks to the same record when it retries, and no orphan record
   pins GC.
   The new device keeps the old one's name and platform, records which device it forked from, and starts with no
   consumed sequence.
   The old record keeps working for the other copy, if there is one.
   A forked-from record that makes no request for 24 hours is marked stale.
   A rolled-back file's old record then does not pin GC for 90 days; a live copy syncs far more often.
4. Re-stamps every `local` cohort with the new device id and renumbers every pending row at the new sender's
   sequence.
   Re-stamping is required: two copies that adopted the same remote stamp mint identical HLCs next.
   Renumbering starts at 1 in the old order and moves the sender and seq of the register, origin, or tombstone each
   row wrote; rows in `sync_held` keep the seqs they were consumed at.
   Steps 1, 2, and 4 and the swap of the device id are one local transaction, after the new token is stored, so a
   crash leaves the file as it was or fully switched.
   The re-bootstrap barrier opens in the same transaction, so the new id never runs without it.
5. Re-bootstraps (§Recovery), own entries included, because writes under the old id were excluded from its pulls.

No user action is needed.
Two live copies of one file end up as two devices.

## Transport

### Wire

HTTPS REST with CBOR bodies and zstd, plus one WebSocket that carries only nudges.
Pairing codes travel in request bodies, never in URLs.
Every request carries a token or a pairing code, so a device accepts a server URL only if it is `https`, or `http`
to a loopback host.
Every request is limited by body size, zstd expansion ratio, CBOR depth, envelope count, and per-envelope payload
size.
Unknown `kind`, `group`, or `op`, and lane mismatches, are rejected at a header allowlist.

### Endpoints

| Endpoint | Purpose |
| --- | --- |
| `POST /v1/spaces` | Create a space and enroll its creator; setup token |
| `GET /v1/spaces` | List spaces; setup token |
| `POST /v1/spaces/{space}/pairings` | Issue a pairing code; device token, or setup token for break-glass; revoking the issuer invalidates its codes |
| `POST /v1/pairings/preview` | Body has `code`; space name, epoch, approximate counts and bytes; does not consume the code; rate-limited |
| `POST /v1/pairings/claim` | Body has `code`, name, platform, nonce; returns device id, token, epoch, and restore points; the same nonce returns the same result |
| `POST /v1/spaces/{space}/push` | Batch of envelopes; atomic, with per-seq outcomes |
| `GET /v1/spaces/{space}/receipts` | Stored outcomes for any sender's seqs; usable while `rebase_required` |
| `GET /v1/spaces/{space}/pull?lane&after&max_seq&limit` | Envelopes with `after < seq <= max_seq`, own sender excluded, minus anything under a committed deletion scope; each entry carries `(seq, sender, sender_seq)`; returns `scanned_through`, `has_more`, heads, epoch |
| `POST /v1/spaces/{space}/bootstrap` | Opens a snapshot lease at live heads; returns `snapshot_id`, counts, byte estimate, TTL, absolute expiry; pages start at position 0 |
| `GET /v1/spaces/{space}/bootstrap/{snapshot}` | Streams the pinned snapshot with the same per-entry metadata as pull; hot by kind, referents first, then `seq`; cold newest-first by `(hlc, stamp_device, seq)`; own sender included |
| `POST /v1/spaces/{space}/bootstrap/{snapshot}/heartbeat` | Extends TTL up to the absolute expiry |
| `DELETE /v1/spaces/{space}/bootstrap/{snapshot}` | Releases the lease |
| `GET /v1/spaces/{space}/events` | WebSocket; `{ head_hot, head_cold }` on change |
| `GET/DELETE /v1/spaces/{space}/devices[/{id}]` | Device list and revocation; `DELETE` of self is detach |
| `POST /v1/spaces/{space}/devices/fork` | Current token in, new device id and token out (§Devices) |
| `POST /v1/spaces/{space}/ids/known` | Id chunk in, the ones live or fenced in the space out, each marked which (§Joining) |
| `PUT/GET /v1/spaces/{space}/attachments/{id}` | Attachment bytes and metadata (§Attachments) |

Every response body is `{ meta, ok }` or `{ meta, error }`.
`meta.server_time_ms` is always present.
`meta.epoch` is present when the path names an existing space, unless the token belongs to another space.
`meta.device` is present when a device token authenticated the request.
It carries both lane heads, both GC horizons, `write_schema` per kind, and the caller's `last_sender_seq`.
`error` is `{ code, message }`, with a code from §Errors.

### Bodies

Bodies are CBOR maps that reject unknown keys; this crate's `transport.rs` defines them.
Space, device, epoch, and nonce ids are 16 raw UUID bytes; paths carry them as hyphenated UUID text.
A request body may be zstd (`Content-Encoding: zstd`); a reply is zstd when the request accepts it.
A body is at most 16 MiB after decompression, and zstd may expand a request body at most 32 times its size.
A reply is limited by size only, since a push reply's repeated outcomes compress far past that ratio.
A device sends a request body uncompressed when zstd would expand it past the ratio, which the server refuses on every
retry.
Names are 1 to 100 characters after trimming.
`platform` is one of `desktop-win`, `desktop-mac`, `desktop-linux`, `ios`, and `android`.

| Endpoint | Request | `ok` |
| --- | --- | --- |
| `POST /v1/spaces` | `name`, `device_name`, `platform`, `nonce` | `space_id`, `device_id`, `token`, `epoch` |
| `GET /v1/spaces` | none | `spaces`, each with `id`, `name`, `created_at`, `device_count` |
| `GET /v1/spaces/{space}/devices/{id}` | none | `id`, `name`, `platform`, `created_at`, `last_seen`, `last_sender_seq`, `last_sender_digest`, `cursor_hot`, `cursor_cold`, `revoked_at`, `rebase_required` |
| `GET /v1/spaces/{space}/devices` | none | `devices`, each a device record as above |
| `DELETE /v1/spaces/{space}/devices/{id}` | none | empty |
| `POST /v1/spaces/{space}/devices/fork` | `nonce` | the new device's enrollment, as space creation returns it; the same nonce returns the same device with a fresh token |
| `POST /v1/spaces/{space}/pairings` | `hint`, optional bytes of at most 4 KiB | `code`, `expires_at` |
| `POST /v1/pairings/preview` | `code` | `space_id`, `name`, `epoch`, `counts` per kind, `bytes` |
| `POST /v1/pairings/claim` | `code`, `name`, `platform`, `nonce` | `enrollment` as space creation returns it, `hint` |
| `POST /v1/spaces/{space}/push` | `items`, each `sender_seq` and `envelope` bytes; at most 5000 | `outcomes`, each `sender_seq`, `outcome`, `replayed`, and `missing_attachments` when not empty |
| `POST /v1/spaces/{space}/ids/known` | `ids`, each `kind` and `id`; at most 1000 | `ids` the space holds, in the order asked, each `kind`, `id`, `state` (`live` or `fenced`) |
| `GET /v1/spaces/{space}/pull?lane&after&max_seq&limit` | `lane` and `after`; `max_seq` defaults to the lane head | `entries`, each `seq`, `sender`, `sender_seq`, `envelope`; `scanned_through`, `has_more` |
| `POST /v1/spaces/{space}/bootstrap` | none | `snapshot_id`, `counts` per kind, `bytes`, `head_hot`, `head_cold`, `ttl_ms`, `expires_at`, `absolute_expiry` |
| `GET /v1/spaces/{space}/bootstrap/{snapshot}?lane&after&limit` | `lane`; `after` is a stream position, 0 at the start | `entries` as pull returns them, `next` position, `done` |
| `POST /v1/spaces/{space}/bootstrap/{snapshot}/heartbeat` | none | `expires_at`, `absolute_expiry` |
| `DELETE /v1/spaces/{space}/bootstrap/{snapshot}` | none | empty |
| `GET /v1/spaces/{space}/receipts?sender&after&through` | `through - after` at most 5000 | `receipts`, each `sender_seq`, `digest`, `outcome` |
| `PUT /v1/spaces/{space}/attachments/{id}` | `mime`, optional `width` and `height`, `bytes` | empty |
| `GET /v1/spaces/{space}/attachments/{id}` | none | `mime`, optional `width` and `height`, `bytes` |

Creating a space also enrolls its creator, so the first device needs no pairing code.
The same `nonce` returns the same result, token included, for 10 minutes.
A space's `device_count` counts the devices that are not revoked.
The claim reply gains `restore_points` with server restore (§Recovery).
An outcome is a map tagged by `status`, such as `{ status: applied }` or `{ status: held, reason: schema }`.
A receipt range is `after < seq <= through`.
An endpoint that returns nothing answers `ok` with an empty map.

### Errors

| Code | Status | When |
| --- | --- | --- |
| `bad_request` | 400 | A body or query that does not decode, or a value out of range |
| `unauthorized` | 401 | A missing or wrong setup token |
| `revoked` | 401 | A device token of a revoked device (§Devices) |
| `unknown_device` | 401 | A device token that matches no device, as after a restore that predates the device |
| `unknown_space` | 404 | A missing space, or a device token of another space; both answer alike |
| `not_found` | 404 | A missing endpoint, or a record the caller cannot see |
| `pairing_failed` | 404 | A used, expired, or wrong pairing code (§Pairing) |
| `stamp_ahead` | 409 | A pushed stamp more than 5 minutes ahead of server now (§Skew guards) |
| `schema_read_only` | 409 | A pushed schema above the kind's `write_schema` (§Schema versions) |
| `cursor_too_old` | 409 | A push from a device that must re-bootstrap first, or a pull from below a GC horizon (§Devices, §Pull cursor) |
| `lease_expired` | 410 | A bootstrap lease that expired, was released, or belongs to another device (§Bootstrap) |
| `too_large` | 413 | A body past its size or expansion cap |
| `rate_limited` | 429 | Too many wrong pairing codes (§Pairing), or too many open bootstrap leases (§Bootstrap) |
| `internal` | 500 | A server fault |

The protocol also has `epoch_changed` and `507`.
Each gets its row with the server work that answers it.

### Push outcomes

| Status | Outbox | Local row |
| --- | --- | --- |
| `applied` | Clear | Keep |
| `stale` | Clear | Keep; pull supplies the winner |
| `fenced` | Clear after local delete | Delete and fence |
| `existence` | Clear | Keep |
| `dependency_fenced` | Clear after the named action | Drop the entity, or keep it for its referent's tombstone |
| `held { reason }` | Move to `sync_held` | Keep; regenerate at the tail with the **same stamp and `commit_id`** when the reason clears |
| `seq_reused` | Stop | The file is behind and forks (§Devices) |

Every status except `seq_reused` consumes the sequence.
A push is atomic: one transaction consumes every new item or none.
Items arrive in strictly ascending `sender_seq`; an undecodable envelope or a misordered seq fails the push.
`seq_reused` can only follow replays, because a new seq lifts the high-water above every later item's.
The server stops at it and commits the replays, which consumes nothing new.
The client applies an outcome in the same transaction that clears or moves its outbox row.
After a lost reply, the same-digest retry returns the same outcome.

What the device does for each:

- `fenced`: it deletes the entity and its descendants, as an applied tombstone would.
  It fences the id with the rejected envelope's stamp; the tombstone, when pulled, meets that fence.
- `existence`: it drops the pending write, and the local row keeps its value.
  Capturing the missing referent waits for heal re-push, which re-encodes rows from their stored stamps.
- `dependency_fenced { drop_entity }`: it deletes the entity and its descendants without publishing.
  The dead parent's or template's tombstone arrives by pull.
- `dependency_fenced { repair_pointer }`: it drops the pending write.
  The referent's tombstone, when pulled, sweeps the pointer.
- `held`: the row moves to `sync_held` with its reason.
  This app version regenerates nothing, because only a schema bump or quotas can clear a reason.
- `seq_reused`: the push stops, and the file forks to a new device id (§Devices).

`held` reasons:

- `schema`: the envelope's schema is not the kind's current `write_schema`.
- `dependency`: it names, as its id, parent, or hard ref, an entity whose create this sender had held.
  A create does not count its own id, so the regenerated create can land.
  Any outcome of that create other than `held` releases the entity: its dependents then meet the ordinary rules.
- `quota`: the space is over quota.
  Shrinking writes (tombstones) are still admitted, which is why holding consumes the seq.

Regeneration is topological: creates, then pointer groups, then children.
It changes only `sender_seq`, schema version, digest, and bytes.

Every outcome for a `cards.create` or `cards.content` envelope, `stale` included, carries `missing_attachments`.
Those are the ids the envelope links that the server holds no bytes for.
The field sits next to the outcome, not in it, and is omitted when empty.
The server computes it when it builds the reply and never stores it in the receipt.
A replay after an upload therefore reports only what is still missing.
After a heal restore, the device that wins the re-push race may lack the bytes while a `stale` one holds them.
Both are told.

### Quotas

Each space has a size quota, and the server has disk watermarks.
Growing writes above them become `held { quota }`; bootstrap above them is `507`.
Tombstones are admitted above the soft watermark.
Emergency headroom is reserved for one bounded delete chunk.
A tombstone is refused before fencing if even that cannot fit.

### Corrupt envelopes

Capture decodes every envelope it encodes and compares the result with the row before the local transaction
commits.
A mismatch fails the local write with an error.
An encoder bug therefore surfaces on the writing device and never reaches the log.
What remains is a decoder bug in the receiving app version, or storage damage.
The client cannot tell which, so it never guesses a value:

- **Delete**: apply from the header.
  Unreadable hints mean no `successor`.
  The cursor advances.
- **Reset**: apply from the header.
  Display time comes from the HLC wall part.
  The cursor advances.
- **Anything else**: hold that lane at that seq and report `corrupt_envelope { seq }`.
  A hold in `hot` also stops `cold`, because reviews must not arrive before their cards.
  A hold in `cold` leaves `hot` running.
  Pushing continues.

An app upgrade that reads it releases the hold; that covers decoder bugs.
For bytes that are really damaged, an operator drop removes the version from the log, and holding clients pass it.
Dropping a create also tombstones the entity, so every replica converges.
That tombstone is server-authored.
Its `stamp_device` is the reserved nil UUID, and its HLC is above both the dropped envelope's and server now.
Its `sender` is the reserved server id, which no restore roster contains.
Dropping an update or review leaves devices with what they had.
A fresh bootstrap then sees that group as of the entity's create until the group is written again.
Storage damage on the server is better answered by restore (§Recovery).

An unknown `schema` or `kind` holds the same way and reports `update_required` (§Schema versions).

### Lanes

| Lane | Kinds |
| --- | --- |
| `hot` | Everything except reviews |
| `cold` | `reviews` |

Order holds inside a lane: a device pushes in `sender_seq` order and never creates a dependency after its
dependent.
Across lanes it holds because `cold` is pulled only up to a `max_seq` recorded before `hot` was pulled to head.

### Cycle

1. Read the own device record.
   If the file is behind, follow §Devices.
   If the record is `rebase_required`, or the file's own `hot` cursor is below the GC horizon in its reply,
   re-bootstrap (§Re-bootstrap); **do not push**.
2. Push the outbox in batches of a few thousand envelopes or a few MB, never splitting a cohort.
   Stop at `seq_reused`.
   A push or pull answered `cursor_too_old` re-bootstraps the same way.
   The server marked the device stale, or collected a tombstone above its cursor, after the round read its record.
3. Record `head_cold`.
4. Pull `hot` to head, one transaction per page, advancing to `scanned_through`.
5. Pull `cold` up to the recorded `head_cold`.
6. Repeat until the outbox is empty and both cursors are at head.
7. Repair learning defaults that name no live row (§Deletes); a repair goes out in the next round.

The device records `head_cold` from the device record it read in step 1, before pulling `hot`.
One call runs a bounded number of rounds; the next trigger picks up what is left.

Triggers: every local commit (coalesced over ~300 ms), every nudge, app foreground, network regained, and a safety
poll every few minutes when the socket is down.
A grade reaches another live device in about a second.
Until the nudge socket exists, a device polls every 60 seconds instead, so a grade can take up to a minute.
One cycle runs at a time; triggers during a cycle run one more after it, and errors back off up to the poll
interval.

Attachment transfers run after the rounds, one at a time, uploads and fetches alike.
They carry no stamps, so they also run when the rounds stop for clock skew or a file that is behind.
They stop early when a trigger arrives, so the rows a local change wrote go out first, and after 64 MiB of bodies.
When transfers are still due, the next cycle starts at once instead of waiting for the poll.
A bounded tick spends its byte budget on transfer bodies as on pull pages.

### Outbox

The outbox is keyed by `sender_seq`.
Each row holds the fully encoded envelope, its digest, `commit_id`, and an in-flight flag.

There is at most one not-in-flight row per group.
A second local write to the same group deletes that row and inserts a new envelope at the tail seq.
An in-flight row is never changed; the new write is a new tail row.
A delete is appended at the tail and replaces nothing.
The entity's earlier pending rows still push first, so a pending child never names a parent the server has not seen;
the tombstone then removes both.

Lost response: retry the same bytes; do not re-stamp or coalesce into that seq.

A winning remote apply may semantically kill a not-in-flight local cohort.
Examples: a reset that kills a pending grade, or a tombstone that kills a pending create.
Those pending members are dropped in the same transaction.

### Backfill

Enabling sync with existing data does not materialize the whole database into the outbox.
A resumable scan walks algorithms, algorithm revisions, templates, decks, and cards by id.
On the device that creates the space it then covers the `learning` document.
Reviews and scheduling snapshots follow (§Existing rows at enable time).
It tops the outbox up in bounded batches and advances its watermark in the same transaction.
A batch never splits one entity's envelopes.
The engine adds a batch before each push while the outbox holds less than one push batch, so the outbox never holds
the whole database.
A batch is at most 500 envelopes and ends with the entity that reaches 1 MiB, so its cohort always fits one push.
It skips a row that already has an origin, and a group whose register holds a write, not a synthetic floor.
Both were written since enrollment and hold a newer head.

Capture that touches an unstamped entity backfills, in the same transaction and order:

1. unstamped algorithms named by the entity or its ancestors;
2. unstamped templates named by the entity or its ancestors;
3. the unstamped parent chain (deck create plus pointers);
4. the entity's own create and current groups;
5. the triggering write.

The backfilled envelopes join the triggering commit and share its stamp.
Capture checks only while backfill runs; once the last phase finishes, every row is stamped.
A delete backfills nothing, because a tombstone for an id the server does not hold is accepted as a fence.
A joiner's stamp-zero seed row counts as stamped, so an edit of it pushes only the edit.

### Bootstrap

Rough sizes for a heavy user (500k cards, 20M reviews):

| Lane | Envelopes | Uncompressed | zstd |
| --- | --- | --- | --- |
| `hot` | ~1M | ~350 MB | ~70–120 MB |
| `cold` | 20M | ~1.2 GB | ~300–400 MB |

Personal scale is tens of MB for both lanes, plus attachments if downloaded.

Bootstrap opens a **snapshot lease**: materialized `snapshot_items` for the live heads and creates after every
committed deletion scope.
Tombstones are not in the snapshot; the catch-up pull delivers them.
The lease pins those versions until release or expiry; compaction and chunk cleanup cannot remove them.
A lease taken before a later tombstone keeps its selected versions, and catch-up delivers the tombstone.

Admission: one lease per device, a heartbeat TTL, and an absolute lifetime.
Space-wide caps limit concurrent leases and pinned bytes.
Opening a second lease for a device releases its first.
The TTL is 5 minutes, and a heartbeat extends it, never past the absolute lifetime of 24 hours.
A space serves at most 4 open leases; a fifth gets `429 rate_limited`.
The cap on pinned bytes comes with quotas (§Quotas).
An expired or released lease answers `410 lease_expired`, and only the device that opened a lease may read it.
Revoke, restore, and absolute expiry cancel a lease.
The client preflights free disk against the byte estimate.

`hot` streams referents first: algorithms, algorithm revisions, templates, decks, cards, then the `learning`
document, each kind in `seq` order.
Every page therefore applies without buffering.
A deck create also finds every live algorithm and template already local for its placeholders (§Field groups and
merge).
A `seq` order across kinds would not: compaction can leave a deck's create below the create of every live
algorithm, once its birth algorithm is deleted.
Repair **must not publish** until the snapshot is applied.
A follow-up pull must also have reached a head observed after the lease was taken.

`cold` is two-phase.
Record the pinned cold head `H`, pull `hot` past it, and stream entries with `seq <= H` newest first.
Then switch to incremental pulls from `H`.

Join bootstrap is **union**: it never deletes a local id because the snapshot lacks it.
Absence cleanup belongs only to re-bootstrap (§Recovery).

On a joining device, bootstrap runs in this order:

1. Open a lease and record its `head_hot` and `head_cold`.
2. Stream the `hot` snapshot; its pages leave the cursors alone.
3. Pull `hot` incrementally from `head_hot` to a head read after the lease opened.
4. Stream the `cold` snapshot and set the `cold` cursor to the lease's `head_cold`.
5. Clear the bootstrap flag, release the lease, and repair learning defaults.

The normal cycle then pulls `cold` from that head.
Nothing is pushed until the bootstrap ends.
Every path that makes a joiner active sets a persisted flag, so a relaunch bootstraps again instead of pulling from
0.
The device heartbeats once the last reply's server time is within half a TTL of the lease's expiry.
A lapsed lease (`410 lease_expired`) restarts the bootstrap from step 1; union apply makes the repeat safe.
A lease that lapses once its pages are applied is released all the same; it does not restart a finished bootstrap.
`429 rate_limited` waits for the next cycle.

### Metered networks

Incremental sync of a small outbox and pulls near head always run.
Bulk transfers pause on `metered` or `low_data` networks above a host threshold (20 MB by default).
Bulk means bootstrap, re-bootstrap, backfill, a large import, the `cold` tail, and attachment transfers outside the
device's download policy.
The engine reports the pause with the estimate, and the host can continue on demand.

## Recovery

### Re-bootstrap

Used for `cursor_too_old`, a stale device's return, and a file that is behind (§Devices).
Not used for joining.

The barrier is a rebase generation and an open flag, both persisted.
Opening it raises the generation.
Opening it while it is open changes nothing, so a relaunch or a lapsed lease resumes the same re-bootstrap.
A cycle that finds the barrier open resumes it before anything else, as a joiner's cycle resumes its bootstrap.

1. Open the barrier, then a snapshot lease.
   Do not push.
2. Apply the snapshot, own sender included, through the apply rule.
   Every create it delivers marks its origin with the generation, whether the apply rule inserted the row or dropped
   the create as a duplicate.
3. Catch up incrementally to a head observed after the lease, marking the same way.
   `cold` resumes from the lease's cold head, as in a join bootstrap.
4. Clean up absence in one transaction.
   An algorithm, template, deck, or card whose create origin has no mark of this generation is absent on the server.
   The exception is a create still in the outbox, in flight or not, or held: the server never took it.
   - Absent rows are deleted with their descendants, registers, origins, and pending writes, as an applied
     tombstone deletes them, edits made after the barrier opened included.
     No tombstone and no fence are recorded, because the server's reason for lacking the entity is not known to be
     a delete.
     Pointers to a deleted algorithm or template repair with no successor.
   - Everything the stream delivered stays with its pending writes, and so does every create still waiting.
     A pending write under a parent the server deleted dies with the parent.
   - Reviews follow their card, or die under a pulled reset.
     Revisions and settings have no tombstones, so absence never deletes them.
   - The scan walks keyset batches and holds nothing in memory per entity.

   It then sets the `cold` cursor and closes the barrier.
5. Release the lease, then push what remains.
   Already-accepted envelopes replay; losers come back `stale`; a create the server fenced comes back `fenced`.

Marks carry the generation, so nothing clears the marks of an earlier re-bootstrap.
The clock advances past every stamp the stream delivers, as apply always does.
A create that came back `existence` earlier has an origin and no pending row, so cleanup deletes it.
That loss is accepted: `existence` is a capture bug, and the heal re-push it waits for belongs to server restore.

### Server restore

A server restore replaces every server database from one backup manifest.
It appends a restore point per space:

- a fresh, never-issued `epoch`;
- the mode, `heal` (default) or `authoritative`;
- head `seq` per lane;
- `last_sender_seq` per device, from the space database;
- invalidated pairing codes and leases.

Restore points accumulate: the new generation carries every earlier restore point forward.
A device on an older epoch, perhaps offline across two restores, applies all points newer than its epoch as one.
The combined mode is authoritative if any of them is.
Each device's cutoff is the lowest among them.

Tokens survive a restore, so restored devices recover without pairing.
A device revoked after the backup would come back with them, so restore guards that:

- if the replaced data is still readable, revocations newer than the backup are carried forward;
- the operator confirms the list of restored devices before the restore finishes;
- the operator may rotate every token instead, and every device re-pairs.

A device enrolled after the backup has no restored record.
It gets `401 unknown_device` with the new epoch, re-attaches with a pairing code, then runs the restore path
(§Joining).

**Heal** puts the space behind its devices, which then fill it back in.
A client on the old epoch gets `epoch_changed` with the restore points, then:

1. Stores the new epoch and sets each cursor to `min(cursor, restore seq)`.
2. Scans its registers, origins, and tombstones.
   It enqueues every register, create, review, and tombstone whose origin `(sender, sender_seq)` is above that
   sender's restore `last_sender_seq`, or whose sender is not in the restored roster.
   That includes other devices' writes, re-encoded from the row with their stored stamp (§Field groups and merge).
   The scan walks in backfill order: algorithms with revisions, templates, decks, cards, reviews; creates before
   update groups; tombstones last.
   A device that holds an entity therefore re-pushes its ancestors and referents first.
   It never gets `existence` for its own re-push.
   Every re-pushed row goes into a `fixed` cohort; a clock-skew re-stamp never touches it.
3. Resumes the normal cycle.
   It does not bootstrap and deletes nothing.

Several devices may re-push the same write; the server keeps one and returns the rest as `stale`.
Across devices, order is arbitrary.
A tombstone for an id the server does not hold yet is accepted as a fence.
A create re-pushed later by another device is then `fenced` (§Deletes).
A write survives a heal if any device that still syncs had applied it.
Tombstones are terminal, so a re-pushed delete kills a restored live row whatever its HLC.

**Authoritative** makes the backup the truth, for when something bad already reached every device.
Examples: a mass delete, a bad import, a device gone wrong.
A client on the old epoch keeps its device-local settings and deletes every product row and sync table.
It keeps `device_id`.
It sets `next_sender_seq` above both its local value and the server's `last_sender_seq` for it, so it never reuses
a consumed sequence.
It then joins as a blank file under its existing token (union bootstrap of the backup).
Everything written after the backup is lost on purpose, including pending local writes.
The host warns before it starts.
A device that is offline at the time does the same when it next connects.
A device that re-attaches after an authoritative restore learns the mode on claim and takes the same path.

## Joining

### Modes

Joining looks at the local file:

| File | Mode |
| --- | --- |
| Blank | Join; skip the product seed; seed device-local settings and the `learning` document at stamp zero |
| Only the untouched first-run seed | Join; probe the two seed ids; seed rows the space holds live stay at stamp zero and are overlaid, the others are deleted; the seed algorithm's local revisions are deleted, and the space's history arrives; `learning` stays at stamp zero and is overlaid |
| Used, never synced, or from another space | Probe, then the user picks **Add** or **Replace** |
| Was in this space | Re-attach |

A file is blank until its first-run seed writes settings.
A blank file that joins seeds only its settings.
Its `learning` defaults name the seed ids until the space's `learning` document overlays them.
A file holds only the untouched first-run seed when its rows are the seed algorithm with its one revision and the seed
template, both unmodified, and it has no deck or card; `learning` does not count.
A seed row is unmodified while its `updated_at` is NULL.
Every save sets it, even one that changes nothing.
A file was in this space when its sync state is active there; a file still in `import_pending` is judged by its rows.
A file holding only the untouched first-run seed goes through the same claim, probe, and Add as a used file.
It joins without asking the user, and only Add's seed-row rules change it.

Every mode claims the code, receives an active token, and runs the normal cycle with a union bootstrap.
The claim records the server URL and the epoch with the new device id.
There is no server-side provisional state; a used file only waits locally for the user's choice.

### Used database: probe, then Add or Replace

Independently minted UUIDv7 ids never collide.
A local id that the space already holds means this file is a copy of data already synced, or shares an ancestor
with it.

Recording the claim clears every sync table and puts the file in local phase `import_pending`.
Nothing recorded for an earlier space can then be pushed or applied under the new device id.
While pending, the file pushes, pulls, captures, and backfills nothing.
Add backfills any row written meanwhile, and Replace deletes it.
It sends its hot-lane ids, seed ids included, to `POST .../ids/known` in chunks.
The server answers which are live and which are fenced in the space.
Reviews are not sent: a review can only collide if its card does.
The user then picks **Add** or **Replace**; known ids mean a likely copy, for which Replace is the safer choice.
No probe answer is stored: Add probes the space again when the user picks it, since the space may have changed.
The choice survives a relaunch, because the file stays `import_pending` until it is made.

**Add** is one local transaction:

1. Remint each known entity other than a seed row, and its dependents, rewriting every pointer, learning default,
   and revision `algorithm_id` that names it:
   - a deck with its cards and their reviews;
   - a card with its reviews;
   - an algorithm with its revisions;
   - a template alone;
   - a revision alone.

   Live and fenced ids are reminted alike.
   A dependent moves with its known parent even when the space never saw the dependent.
   Reminted rows keep every other column, including `created_at` and `updated_at`.
2. Seed rows the space holds live:
   - the seed algorithm keeps its id if unmodified; its local revisions are deleted and the space's history
     arrives;
   - the seed template keeps its id if unmodified **and** no local card uses it;
   - an edited seed, or a seed template with local cards, is reminted like any other row.
     The space can then hold two starter templates.

   Seed rows the space does not hold live, because it deleted them or never had them:
   - an unmodified seed row that no local deck or card uses is deleted;
   - any other is reminted like any other row.
     A joiner never pushes a seed id the space does not hold, so two joiners cannot collide on it.
3. Keep `settings.learning` at stamp zero, so the space's learning settings win.
4. Start the backfill scan and enter the normal cycle.

Attachments never remint (content-addressed).
Template field ids never remint (scoped by their template).
Device-local data that mentions reminted ids, such as conversation transcripts, is not rewritten.
A database that never touched this space remints nothing; Add then costs only the backfill.

Accepted edge: two copies of one never-synced file that probe at the same moment both see nothing known.
Their creates for shared ids then collapse into one (`stale`), and their edits merge by LWW instead of
duplicating.

**Replace** deletes every product row, then joins as a blank file.
It keeps the settings rows, conversations, and attachments.
`learning` stays at stamp zero, so the space's document overlays it.
Cards that arrive from the space reuse local attachment bytes; the startup sweep removes images no card references.

### Re-attach

A file that was in this space claims a new code.
That covers a detached or revoked file, one enrolled after the backup of a restored server, and rotated tokens.
It keeps rows, stamps, origins, cursors, tombstones, and outbox bytes.
It then follows steps 1, 2, and 4 of the "behind" procedure (§Devices) with the old device id.
If the claim returns a newer epoch than the file's, it then runs that restore's path (§Recovery) before the cycle.
Otherwise it re-bootstraps only if `cursor_too_old`.

### First-run seed

Setup offers starting fresh or joining an existing space.
Joining skips the seed algorithm and template; the space's creates insert whichever the space holds.
Starting fresh and then joining, with seeds untouched, is the second row of the modes table.
The space may have deleted either seed row; every joining mode keeps a seed id only while the space holds it live.

Accepted edge: a seed deleted between the probe and the bootstrap lease stays on the joiner as a local-only row.
That needs another device to delete it while this one joins; the user can delete the row again.

### Setup hint

The inviting device may attach its interface settings, minus locale, to the pairing code.
The server holds the hint for the code's TTL and returns it on claim.
A blank joining device applies it before first render.
Hotkeys and locale are never included.
Nothing keeps syncing afterwards.

### Pairing

- **Setup token**: created with the server; required to create a space.
- **Pairing code**: 10 characters of Crockford base32 (digits and capitals without `I`, `L`, `O`, `U`), single use,
  valid for 10 minutes from issue, issued by an enrolled device.
  It is shown as text and as a QR that also encodes the server URL and space id.
  Case, spaces, and hyphens do not matter, and `O`, `I`, and `L` read as `0`, `1`, and `1`.
  The server stores only its hash.
- **Claim**: a claim retried with the same nonce returns the same device and token until the code expires.
  A different nonce on a used code fails.
  A device that gets no reply to its claim retries it with the same nonce.
- **Preview first**: a joining device previews the code, then tells its mode for the previewed space, before it
  claims.
  A file that would re-attach is refused while its code is still unused.
- **Failures**: a used, expired, or wrong code fails alike with `pairing_failed`, so a reply never says which.
  Wrong codes are limited per client address and server-wide, because a wrong code names no space.
  After 10 failures from one address, or 100 in all, previews and claims get `429 rate_limited` until the minute's
  window ends.
- **Break-glass**: the setup token can issue a pairing code for an existing space.

Transport security is TLS.

E2EE later needs a space key the server never sees.
QR pairing carries it device to device.
Typed codes use a PAKE over the server as a blind relay.
A recovery key is printed once at space creation.

## Attachments

Attachments are immutable and content-addressed: `id` is the lowercase hex SHA-256 of the bytes.
They need no merge, no stamps, and no tombstones, so they are not an envelope kind.

### References

Card content links an image as `attachment:<id>`.
Capture of `cards.create` and `cards.content` computes the linked ids and puts them in header
`refs.attachment_ids`.
These refs are soft.
The server accepts the envelope whether or not it holds the bytes.
Clients apply it whether or not the attachment is local.

### Upload

`PUT /v1/spaces/{space}/attachments/{id}` carries the whole image: its bytes and metadata (mime, width, height).
An image is at most 5 MiB, well inside the body cap, so a transfer is one ordinary CBOR request.
The server checks that `id` is 64 lowercase hex characters, the size cap, and that `mime` is an accepted image type.
Width and height are positive when present.
Last, it checks that the SHA-256 of the bytes equals `id`.
It never reads the bytes themselves, so ciphertext can replace them later.
Upload is idempotent: a second `PUT` of a stored id answers `ok` and keeps the first upload's metadata.
The device's upload queue holds every `missing_attachments` id a push outcome reported, queued in the transaction
that settles the outcome.
Capture adds nothing: every card envelope it records is pushed, and its outcome names exactly what the server lacks.
That covers backfill, Add, and a heal re-push the same way.
Row sync never waits on an upload; the bytes go up after the push that reported them.
A device that lacks the bytes for a reported id does not queue it, and an upload whose attachment was swept drops.

### Download

Applying a card `create` or a winning `content` that links an id with no local attachment row enqueues a fetch.
Snapshot apply does the same.
Device policy decides when it runs: always, on unmetered networks, or on demand when a card is shown.
Until device policy exists, every queued fetch runs.
A fetch whose attachment arrived meanwhile drops before it runs.
So does a retry after `404` that no local card links any more.
A first attempt skips that check, because it scans every card; one whose card went first costs a download that the
startup sweep later removes.
`GET` returns the bytes and the metadata.
The client verifies the hash and validates the bytes as a local add would, before inserting the row and bytes.
Bytes that fail either check are not stored, and the fetch drops.
`404 not_found` means no device has uploaded the bytes yet: the fetch waits 1 minute, doubling up to 6 hours, and
tries again.
Resumable transfers (`Range`, `Content-Range`) may come back if larger media arrive.

### Lifetime

Locally, the attachment sweep is unchanged: it removes attachments that no local card links and that are older than
its grace cutoff.
Card content stays the only thing that keeps an attachment alive (`docs/decisions/MEDIA-STORAGE.md`).
The upload queue does not pin anything.
An upload whose attachment was swept is dropped, because no local card links it any more.
A swept attachment that a later card links again is fetched again.

On the server, `attachment_refs` tracks which ids each live card links through its **current** content.
That is the `cards.content` head, or the `create` if the card has none.
It is updated whenever a card's content head moves or a delete removes the card.
An image dropped by an edit therefore stops counting.
Each stored attachment records when its last ref went, or when it was stored if nothing linked it then.
A ref that returns clears that time.
An attachment no card links becomes collectable after the stale-device window (90 days).
An offline device's pending edit that re-links it still finds it.
A collection pass removes every attachment unlinked for more than 90 days, with its bytes; `serve` runs one every
hour.
If it was collected anyway, that push reports it missing, and the device re-uploads it if it still has the bytes.
Deleting the last reference is the delete; adding the same image later is an ordinary upload.

Attachment bytes count toward the space quota.

### E2EE

A plaintext SHA-256 on the wire reveals whether a space holds a known file.
Under E2EE the wire uses a different name for the same attachment: `wire_id = HMAC-SHA256(space_key, id)`.
Header `refs.attachment_ids`, upload and download paths, and the server's `attachment_refs` all use `wire_id`.
Local ids, attachment rows, and `attachment:<id>` links in card content keep the plain SHA-256.
Card content is ciphertext anyway.
Every device in the space derives the same `wire_id`, so dedupe still works inside the space and nowhere else.
Bytes are encrypted before upload.
The server can no longer check the hash, so the client verifies it after decrypting.
Adopting E2EE therefore rewrites no card and re-mints no attachment.
The server's attachment store is re-uploaded under the new names.

## Schema versions

`schema` is a per-kind integer.
Any change to a payload shape bumps it, including adding or removing a group.
The golden envelopes in this crate's `fixtures/` pin the bytes of every group at its current schema.
A change that alters them changes the wire, so it needs a schema bump once any device has written that schema.
A client reads every version of a kind up to its own, filling newer fields with defaults.

The server stores one `write_schema[kind]`, the only version accepted on push.
A client that can write a newer version keeps emitting the current one until the operator raises it.
Older writes come back `held { schema }`; newer ones are `schema_read_only`.
`schema_read_only` fails the whole push and consumes nothing.
Raise it after enrolled devices have advertised they can write the new version.

A client that meets an unknown `schema` or `kind` holds that lane at that envelope.
A `hot` hold also stops `cold`.
It keeps pushing other kinds, does not push the unknown kind, and reports `update_required`.
After the upgrade the pull resumes from the same cursor; nothing was skipped.
Regeneration of held writes preserves `(hlc, stamp_device, commit_id)`.

## Client state

These tables live in the one shared migration series, so web databases have them too.
Only native hosts write them; they are device-local runtime state, never synced.

| Table | Key | Holds |
| --- | --- | --- |
| `sync_state` | Singleton | `device_id`, `space_id`, `epoch`, join phase, cursors, last HLC, stable high-water, `next_sender_seq`, last observed server seq, skew, role (creator or joiner), backfill phase stamps and watermark, rebase generation and barrier flag |
| `sync_stamps` | `(kind, id, group)` | LWW register (§Field groups and merge) |
| `sync_origins` | `(kind, id, group)` | Stamp and sender of immutable rows; legacy timestamp floor for creates; the re-bootstrap generation that last delivered a create |
| `sync_outbox` | `sender_seq` | Encoded envelope, digest, `commit_id`, in-flight flag |
| `sync_cohorts` | `commit_id` | Members, `local` / `uncertain` / `fixed`, original stamp, whether a member was consumed |
| `sync_tombstones` | `(kind, id)` | Stamp, sender, hints |
| `sync_held` | `sender_seq` | Consumed `held` envelopes and their reason |
| `sync_delete_jobs` | `(kind, id)` | Resumable local cascade for chunked deletes; not built while a delete cascades in one transaction (§Deletes) |
| `sync_attachment_queue` | `(id, direction)` | Pending uploads and fetches |

They are the whole schema footprint of sync.

Each syncable kind is defined once in this crate's registry: groups, class, parent, refs, lane, and codec.
Adding a kind later (conversations, AI settings) is a registry entry plus capture in the persistence layer.

## Rulings

Change one only by a new decision, not by editing rules in passing.

1. Enrolled devices in a space are trusted (§Trust model).
2. Product timestamps (`created_at`, `updated_at`, `last_reviewed_at`, reset time, UUIDv7 time) are never merge keys
   or distributed order.
3. Every referenced kind publishes an immutable `create`; there is no upsert class.
4. Envelope `parent`, `cards.deck_id`, and `cards.template_id` are immutable (`docs/decisions/FIXED-CARD-PARENTS.md`).
5. A card whose deck or template is tombstoned is dropped rather than rescued.
6. Reviews have no tombstones; they die with their card or under `cards.reset`.
7. Seed rows follow ordinary deletion rules.
   A dead pointer repairs to the `successor`, else the lowest live id, else a new default row.
   A joiner keeps a seed id only while the space holds it live.
8. The clock always adopts what it applies; the 5-minute guard is an absolute cap against server now.
9. Capture round-trips every envelope before commit.
   Corrupt deletes and resets apply from the header.
   Any other corrupt envelope holds the pull until an app upgrade or an operator drop.
10. An unknown `schema` or `kind` holds the pull until the app is upgraded.
    `write_schema[kind]` is the only accepted write version.
11. A file behind its own server record (rollback or copy) forks to a new device id automatically.
    It re-stamps its unaccepted cohorts and re-bootstraps.
12. Server restore has two modes.
    Heal (default): every device re-pushes what it holds above each origin sender's cutoff.
    Authoritative: devices discard local data and re-download the backup.
    Every restore issues a new epoch and appends a restore point; tokens survive unless rotated.
13. A tombstone for an id the server does not hold is accepted as a fence.
14. Joining with a used database probes the space for ids it already holds.
    The user then picks Add (remint only known ids, with dependents) or Replace.
15. There are no deletion bundles; a future restore-deleted feature covers deletes made after it ships.
16. The header stays plaintext under E2EE, including `parent` and `refs`.
    Attachment ids on the wire become `HMAC(space_key, sha256)`.
17. Attachments sync outside the envelope log, linked by soft header refs.
    They are collected by reference on the server and never tombstoned.
18. Notes are their own group on decks, templates, and algorithms.
    Algorithms split into `title`, `notes`, and `content`.
19. Algorithm revisions sync as immutable rows with no parent and outlive their algorithm.
20. UUIDv7 ids, accepting that they reveal creation time.
21. Sync bookkeeping tables are device-local, and only native hosts write them.
22. Interface settings reach a new device only as a one-shot pairing hint.
23. The stale-device threshold is 90 days; skew tolerance is 5 minutes.
24. Bulk transfers above 20 MB pause on metered networks; tiny incremental sync never does.
25. Break-glass pairing goes through the setup token.

## Conformance cases

Every implementation of the engine and the server must pass these.

- Every row of the collision table, including tied-HLC reset vs grade.
- Reset applied after its reviews; reset against lower and higher scheduling heads; blank scheduling travels with
  reset.
- Re-stamp of a paused device with a remote reset between one grade's two envelopes.
- Compacted bootstrap of edited-then-graded and graded-then-edited cards while another writer compacts.
- Algorithm edited after a dependent deck create; deck created on algorithm A, switched to B, A deleted, then fresh
  bootstrap.
- Rename on one device, notes or parameters on another; a no-op save emits nothing.
- Algorithm deleted while another device changes its parameters (revisions from both survive).
- Re-bootstrap with local writes during absence cleanup.
- Start-fresh-then-Join overlays seeds; Add keeps an unmodified seed algorithm and remints a used seed template.
- Start-fresh-then-Join into a space that deleted the seed template (the local seed row is deleted, never pushed).
- Add with decks on an unmodified seed algorithm the space deleted (reminted, decks follow); an unused one is
  deleted.
- Space created after its device deleted the seed algorithm (the learning backfill carries the real default; a
  blank joiner's defaults never stay on the seed id).
- Add of an unrelated database remints nothing; Add of a copy remints exactly the known entities and dependents.
- Replace leaves no local product rows.
- Start-fresh-then-Join does not push a second initial seed revision.
- Tombstone GC followed by a stale device's push (`cursor_too_old`, no resurrection).
- Server restore with a post-backup write whose HLC is below an unrelated restored head.
- Server restore when the original writer is gone (another device re-pushes its write).
- Foreign low-HLC tombstone after backup (still fences after restore).
- Restore of the same backup twice (new epoch both times; devices recover without re-pairing).
- Heal where one device re-pushes only a tombstone and another the create of the same post-backup entity, in both
  orders (stays deleted).
- Heal re-push by a device that holds a card whose deck create is also post-backup (no `existence`).
- Clock-skew pause during a heal re-push (re-pushed stamps unchanged).
- Device offline across an authoritative then a heal restore (converges on the authoritative backup).
- Authoritative restore never reuses a consumed sender sequence.
- Authoritative restore after a mass delete (every device converges on the backup, including one offline at the
  time).
- Device enrolled after the backup (`401 unknown_device`, re-attach, heal, its writes reach the server).
- Device revoked after the backup, restore with the old data readable (stays revoked).
- Heal where only a `stale` re-pusher holds an attachment's bytes (it uploads).
- File restored from backup with pending writes at reused seqs (fork, re-stamp, no lost writes).
- Copy taken with a reset cohort pending, original pushes only the reset envelope (the copy keeps the cohort's
  stamp; no review beside blank scheduling).
- Two live copies of one file (the second forks, both keep syncing).
- A v2 write before the `write_schema` raise (rejected); a v1 write after it (`held { schema }`).
- A held seq followed by a writable kind; `held { quota }` then a freeing tombstone.
- Corrupt create, update, and review (hold; pushing continues; an operator drop releases; a dropped create
  converges as a tombstone).
- Corrupt delete and corrupt reset (still apply from the header).
- A corrupt review holds `cold` only; a corrupt card create holds both lanes.
- An encoder that loses a field fails the local write and enqueues nothing.
- Partial push and lost acknowledgement for every consuming outcome.
- Card create before referent backfill; concurrent delete of two algorithms while others remain.
- Concurrent delete of the last two algorithms, and of the last two templates (each device creates a default;
  pointers converge).
- Fresh bootstrap of a space whose oldest deck predates every live algorithm (algorithms stream first; no default is
  created).
- Algorithm repair racing a template edit on the same deck; template tombstone racing a card created under it.
- Review pushed during the `hot` pull; snapshot opened mid-delete.
- Client and server running out of disk during a 20M-review deck delete.
- Pre-sync card and review with equal timestamps; a pre-sync reset card whose surviving reviews predate its scheduling.
- Card linking an attachment the server lacks (`missing_attachments`, upload, another device fetches).
- Attachment unlinked on A while B offline re-links it; attachment GC then re-link.
- Image removed from a card by an edit becomes collectable.
- Fetch of an attachment not uploaded yet (`404`, retried).
- Two devices adding the same image (one stored copy).
