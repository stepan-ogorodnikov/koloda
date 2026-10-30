# Media audit fixes

Status: ready
Guides: agents/IMPLEMENTATION-PLAN.md, agents/TASKS.md, docs/specs/MEDIA.md, docs/decisions/MEDIA-STORAGE.md, docs/decisions/TS-RUST-DOMAIN-MIRRORING.md, agents/RUST.md, agents/CODE-STYLE.md, agents/CODE-DOCUMENTATION.md, agents/TESTING.md, agents/VERIFY.md, agents/BACKWARDS-COMPATIBILITY.md, agents/FUNCTIONAL-SPECIFICATIONS.md, agents/DECISIONS.md, agents/MARKDOWN.md, apps/web-e2e/README.md, apps/electron-e2e/README.md, libs/e2e/README.md, apps/electron/IPC.md, agents/REVIEW.md
Flow: local

## Intent

Settle every finding of the media audit as one task.

- The audit covered the behavior owned by `docs/specs/MEDIA.md` and the storage rules in
  `docs/decisions/MEDIA-STORAGE.md`.
  That is inserting images into markdown fields, embedding images from links, accepted formats and size, where
  images show, and cleanup.
  Image sync was out of its scope.
- The audit report (`media.md` in the audit series) was written at `d32fb02e` (`main`).

This file restates every finding and its evidence, so neither the next session nor the archive reader needs the report.

Triage checked each finding again at `2e2b2b27`, where this task branches.
Since `d32fb02e`, none of the editor, insertion, repo, domain, IPC, or display files changed.
Only these cited files did:

- `add-card.tsx` awaits the add and keeps the form submitting meanwhile (`cards-audit` item 4, C22).
  That closes the pending-submit shape the audit tracker flagged beside finding 4.
  It does not hold the form during an image insertion, so finding 4 still holds.
- `libs/srs/src/index.ts` and `markdown.ts` changed for other reasons; finding 10 still holds.
- `libs/app-react/README.md` lost the UI preference line; finding 11 still holds.

Every finding holds.
Line numbers below are at `2e2b2b27`.

The report's verdict: storage is in very good shape.
The two hosts hash, deduplicate, validate, and sweep the same way, with twin tests on each rule.
Display leases, caches, and revokes blob URLs, with gated tests for eviction during a load.
The defects are in the editor, where insertion state is not tied to the field's text.

Done when, in user-visible terms:

- an image stored while the user submits, types, or pastes lands in the field it was inserted into, or nowhere;
- after a card is added, the next card's empty field offers no embed action and shows no old error;
- an image file without an image extension inserts when dropped or picked, and a picked non-image shows the format
  error;
- an image inserted again is kept for a day after that insertion, on both hosts;
- embedding a link works behind the system proxy and with OS-trusted certificates, and still checks every redirect;
- the insertion flows have unit tests that fail on findings 1, 2, and 4, and a `card-images` e2e spec on both hosts;
- MEDIA.md and MEDIA-STORAGE.md say what the code does, including that stored images keep their file metadata;
- `bun run check:push` passes on the tip, and every plan item is one commit with a `Task:` trailer.

## Scope

Entries use the report's numbers with the prefix `M`.

### Spec violations

- M1. Spec violation, Should-fix: the embed action outlives the pasted link after a form reset.
  Decision: fixed by item 2.
  - MEDIA.md §Embedding Images From Links (lines 60-65): the action shows "until the field is edited again".
    Embedding replaces the pasted link, or shows an error and keeps it.
  - The action is local state, `pastedUrl` (`libs/srs-react/src/lib/cards/card-content-text-area.tsx:60`).
    Only an input event (`:123-128`), the start of a file insertion (`:83`), or an embed (`:138`) clears it.
  - A form reset changes the field's text without an input event.
    The add-card dialog resets after each successful add and stays open for the next card
    (`libs/srs-react/src/lib/cards/add-card.tsx:60`).
  - After the reset, the action still shows.
    Clicking it downloads and stores the image (`card-content-text-area.tsx:135`).
    Then `swapPastedUrl` finds no link at the saved offset (`image-insertion.ts:48-51`), and `handleEmbed` returns
    silently (`card-content-text-area.tsx:139`).
    The stored image is orphaned until cleanup.
  - The audit's jsdom probe confirmed it: after paste, reset, and click, the download ran once, the field stayed
    empty, and no error showed.
  - The editor's `errors` state has the same shape: it clears only when the next insertion starts (`:82`), so a
    rejection on one card still shows on the next.
- M2. Spec violation, Should-fix: drop and the picker choose files by declared type, not by content.
  Decision: fixed by item 3.
  - MEDIA.md §Formats and Size (line 82): "The format is recognized from the file's contents, never from its name."
    Line 86: "A rejected file shows an error on that field and inserts nothing."
  - `getImageFiles` keeps only files whose `type` starts with `image/` (`card-content-text-area.tsx:48-50`).
    Browsers set a dropped or picked file's `type` from its extension.
  - Drop (`:157-162`) and the picker (`:181`) both filter through it, and `handleDragOver` uses the same test
    (`:152-155`).
    The content check in `readImageFile` (`:32-46`) never sees the other files.
  - So a PNG named `scan`, `image.bin`, or `photo.dat` is ignored on drop: nothing is inserted and no error shows.
    The probe inserted the same bytes as `cat.png` and ignored them as `scan` with an empty type.
  - In a file dialog that offers all files, a picked PDF is dropped silently, where the spec wants the format error.
  - Paste is not affected: clipboard files carry the clipboard's MIME type.
- M3. Spec violation, Later: an image inserted again keeps its old storage time, so the one-day grace does not cover it.
  Decision: fixed by item 5; a re-add moves the storage time forward (question 2).
  - MEDIA.md §Cleanup (lines 111-112): "An image inserted into a card not saved yet, in this window or another tab, is
    kept for at least a day."
  - MEDIA-STORAGE.md Ruling (line 8): "Adding the same bytes again returns the existing row unchanged."
  - A re-add keeps the first row's `created_at` on both hosts (`libs/db-sqlite/src/lib/attachments.ts:30-36`,
    `crates/koloda/src/repo/attachments.rs:63-79`).
  - The sweep removes unreferenced rows by `created_at` alone (`attachments.ts:50`, `attachments.rs:91`).
  - Scenario (web): an image was first stored a week ago in a card the user has since deleted.
    The user inserts the same file into a new, unsaved card.
    Before saving, they open the app in another tab, and that tab's startup sweep removes the image.
    The saved card then shows the alt text.
  - One tab alone is safe: the sweep runs only at session start
    (`libs/app-react/src/lib/hooks/use-attachment-sweep.ts`).

### Risks

- M4. Risk, Should-fix: a file insertion lands in whatever text the field holds when storage finishes.
  Decision: fixed by item 1.
  - MEDIA.md §Inserting Images (line 41): "its reference is inserted at the cursor, replacing any selected text."
  - `insertFiles` reads the selection before storing (`card-content-text-area.tsx:79-81`).
    It awaits each read and add (`:88-95`), then applies the old offsets to the field's current text
    (`:100`, `insertAtSelection` at `image-insertion.ts:7-16`).
  - Nothing holds the field meanwhile:
    - the text area stays editable;
    - paste and drop do not check `isInserting` (`:108-121`, `:157-162`), which only disables the two buttons
      (`:183`, `:190`);
    - add-card's submit hotkey and Add button do not know about the insertion (`add-card.tsx:65-73`, `:136-142`);
    - the card details form saves through the shared `Controls` (`libs/ui/src/lib/primitives/form/form.tsx:114-133`)
      and resets when the card changes (`card-details.tsx:59-61`).
  - Outcomes:
    - submit during storage saves the card without the image, the reset empties the form, and the image lands in the
      next card (the probe confirmed it);
    - typing during storage shifts the insertion, and with a selection it overwrites what was typed over the old range;
    - a second paste or drop runs a parallel `insertFiles`; the first to finish clears `isInserting` and overwrites
      `errors` while the other still runs (`:97-98`);
    - closing the add-card dialog during storage resets the form, and the image then lands in the reset form, so it
      shows when the dialog opens again (found at triage, same cause).
  - Storage takes a file read, a full decode (`:39`), and on desktop a base64 IPC round trip plus a hash.
    For a large image that is long enough to press the submit hotkey.
  - Triage note: inserting "only when the text is unchanged" alone does not fix the submit case.
    An image dropped into an empty field, then submitted, finds the reset field empty again and lands.
    So item 1 blocks submit and also guards the text.
- M5. Risk, Later: the size cap has four copies, and the TS and Rust domain tests pin neither to a literal.
  Decision: fixed by item 7.
  - Copies: `libs/srs/src/lib/attachments.ts:3`, `crates/koloda/src/domain/attachments.rs:12`,
    `crates/koloda-sync-proto/src/transport.rs:55`, and `apps/electron/src/media-ipc.ts:8` with an INVARIANT naming
    its twins.
  - The Rust domain and the protocol crate are pinned to each other
    (`crates/koloda/tests/domain/attachments_tests.rs:93`).
    Main's copy is pinned to the literal by its test (`apps/electron/src/media-ipc.test.ts:7`).
  - The TS and Rust cap tests each use their own constant (`libs/srs/src/lib/attachments.test.ts:45-47`,
    `attachments_tests.rs:73-76`).
    Changing either constant alone leaves both suites green, and the web would accept sizes the desktop rejects.
    `agents/TESTING.md` (§The TS ↔ Rust twin rule) wants the same boundary on both sides.
- M6. Risk, Later: the link embed fetch ignores the system proxy and certificate store.
  Decision: fixed by item 4; the fetch moves to an in-memory Electron session (question 6).
  - MEDIA.md §Embedding Images From Links (line 65): a link that cannot be downloaded shows a download error.
  - `media-ipc.ts:91-92` uses Node's global `fetch`, Node's HTTP stack, not Chromium's.
    It reads neither the OS proxy or PAC settings nor the OS certificate store.
  - The WHY gives the cookie reason for that choice, not this cost.
    On a network that requires a proxy, or one that inspects TLS with a corporate CA, every embed fails with
    `attachments.fetch`.

### Improvements

- M7. Improvement, Should-fix: the insertion flows have no tests.
  Decision: fixed by items 1-3 (unit, each with its fix) and item 6 (e2e).
  - `agents/TESTING.md` (§Layers and what each owns): user flows belong to e2e; async coordination belongs to the
    lowest unit layer.
  - `card-content-text-area.test.tsx` has one test, a regression for the file input crash.
    Nothing tests paste, drop, pick, order, cursor, partial failure, alt text, or the embed action.
  - In the e2e suites, only the desktop sync spec touches images: it picks one PNG through the hidden file input
    and later sees it in a lesson (`apps/electron-e2e/src/sync.spec.ts:91-100`).
    The web suite has no image flow.
  - Uncovered spec rules: several files in order, one per line, cursor after the last (MEDIA.md lines 42-43); accepted
    ones inserted with an error for the rest (line 88); the format and size errors (line 87); the embed action and
    its errors (lines 59-66); no embed on web (line 70); the image in preview (line 94).
    Findings 1, 2, and 4 would each have failed such a test.
- M8. Improvement, Later: embedded images store no dimensions, and only the editor decodes.
  Decision: fixed by item 9 by recording it in MEDIA-STORAGE.md; no header parsing (question 3).
  - MEDIA-STORAGE.md Ruling (line 12): metadata includes width and height.
    Lines 18-19: "The editor runs the same checks first, only for fast feedback."
  - Width and height come only from the editor's decode (`card-content-text-area.tsx:37-45`).
    The link embed stores bytes alone (`media-ipc.ts:93`), so its rows have null dimensions.
  - A re-add keeps the first row's metadata (M3), so an image first embedded keeps null dimensions even when later
    inserted from a file.
    Sync copies the row's dimensions to other devices.
  - Lessons size an image only when dimensions exist (`libs/srs-react/src/lib/lessons/use-attachment-images.ts:55-56`).
  - The editor's decode rejects a file whose header sniffs as an image but whose body does not decode (`:38-42`).
    Neither repo nor the embed path checks that, so the same bytes are refused when inserted and stored when embedded.
- M9. Improvement, Later: unit gaps in the link fetch and the unreadable-image path.
  Decision: fixed by item 8.
  - `fetchImageBytes` resolves a relative `Location` against the current hop (`media-ipc.ts:68`) and stops after
    `MAX_REDIRECTS` (`:10`, `:67`).
    No test follows a redirect to a 2xx or hits the cap; the only redirect test targets `file:`
    (`media-ipc.test.ts:65`).
    A regression that stopped following redirects, or looped without the cap, would pass.
  - A stored image whose bytes do not decode becomes alt text through the `error` listener
    (`use-attachment-images.ts:45`).
    MEDIA.md line 96 says "cannot be read", and no test fires that event.
- M10. Improvement, Later: two package exports have no consumer outside `libs/srs`.
  Decision: fixed by item 10.
  - `ATTACHMENT_REF_PATTERN` and `MarkdownToHtmlOptions` are exported from `libs/srs/src/index.ts:25` and `:93`.
    `git grep` finds them only inside `libs/srs`: `markdown.ts` imports the pattern from its file, and the options
    type is `markdownToHtml`'s own parameter.
  - `agents/BACKWARDS-COMPATIBILITY.md`: no unused exports.
- M11. Improvement, Later: two comments and a README line are stale.
  Decision: fixed by item 4 (the test WHY) and item 11 (the README line).
  - `libs/app-react/README.md:16` says `App` mounts `useGlobalSync` and `useAppHotkeys`.
    It also mounts `useAttachmentSweep`, the only trigger of image cleanup, `useConversationSaveHost`, and
    `useAssistantEngineHost` (`libs/app-react/src/lib/components/app.tsx:22-28`).
  - `media-ipc.test.ts:4` says media-ipc "registers an IPC handler … on import".
    It registers only in `registerMediaIpc` (`media-ipc.ts:83`).
    The mock is needed because the module imports `ipcMain`, and `app-sender` reads `app.isPackaged` through
    `env.ts` on import.
- M12. Spec hygiene, Later: MEDIA.md restates one rule and does not point at SYNC.md for missing images.
  Decision: fixed by item 12.
  - `agents/FUNCTIONAL-SPECIFICATIONS.md` (§Principles, One home per rule; §Scope).
  - "Text fields do not offer image insertion" (MEDIA.md line 29, §Relationships) restates line 33 (§Inserting
    Images).
  - Line 96 says a missing image shows its alt text.
    On desktop, a missing image comes back when sync downloads it, without a reload (`use-attachment-images.ts:63-73`,
    which cites SYNC.md §Status).
    MEDIA.md's Scope does not name SYNC.md.

### Product decisions

None raised by the report.
Every pasted link offers the embed action, including links to pages (MEDIA.md lines 59-64); the spec chose that.

Two calls from the owner's media sync exploration (written before card media shipped, never in the repo) are
settled here, so nothing about media stays open outside the repo:

- Stored images keep the file's metadata, such as where and when a photo was taken (question 4, item 12).
- There is no "sync media" opt-out: images always travel with the library (question 5; no item).
  `docs/decisions/STORAGE-BUCKETS.md` (attachments are global) and PROTOCOL.md §Attachments already say so.

The rest of that exploration is superseded by MEDIA-STORAGE.md and PROTOCOL.md §Attachments: content-hash ids, soft
refs, no tombstones, server collection after 90 days, alt text for a missing image.
Its per-device download policy is deferred in PROTOCOL.md §Download ("Until device policy exists, every queued fetch
runs").

### Out

- Image sync (upload, fetch, queue, server storage); audited in the sync audits.
- Which other images rendered markdown may show (CARDS.md §Rendered Markdown).
- Audio and video, metadata stripping, a device download policy, and header parsing for dimensions.

## Open questions

- [x] 1. Task shape? — the media report alone; M1 and M4 are one editor change split over items 1 and 2.
  `local` flow, the default.
- [x] 2. M3: does a re-add refresh the storage time, or does §Cleanup narrow the grace? — a re-add refreshes it on
  both hosts, and MEDIA-STORAGE.md's Ruling says so (human, 2026-10-30).
- [x] 3. M8: parse dimensions from image headers, or record that they are optional? — record it: width and height
  are optional, and the decode check is editor-only feedback (human, 2026-10-30).
- [x] 4. Do stored images keep their file metadata (EXIF, including a photo's location), which sync uploads in
  plaintext? — yes; MEDIA.md says so (human, 2026-10-30).
- [x] 5. Is there an account-level "sync media" opt-out? — no; images always sync with the library (human,
  2026-10-30).
- [x] 6. M6: record the proxy limit, or move the fetch to an in-memory Electron session? — move it (human,
  2026-10-30).
  Electron's `session.fetch` cannot do manual redirects (item 4 says why), so item 4 adds a one-hop adapter over
  `net.request`.
  The adapter is unit-tested with a fake request; only the item 6 e2e spec and item 4's manual paths run it for real.
- [x] 7. Plan approved (human, 2026-10-30).

## Plan

`SR`, `SRS`, `DB`, and `EL` below stand for `bunx vitest run --config <dir>/vitest.config.mjs --configLoader runner`.
Their dirs are `libs/srs-react`, `libs/srs`, `libs/db-sqlite`, and `apps/electron`.
`RS` stands for `cargo test -p koloda`.
Line numbers are at `2e2b2b27`; when an earlier item moved them, find the code by its text.

- [x] 1. Hold the markdown field while an image insertion runs
  Goal (M4, M7 unit part):
  - In `CardMarkdownTextArea` (`libs/srs-react/src/lib/cards/card-content-text-area.tsx`), an insertion is a file
    insertion (`insertFiles`, `:76-106`) or an embed (`handleEmbed`, `:130-150`).
    While one runs, the field is held:
    - the text area is read-only;
    - paste and drop on the field start nothing; check a ref, not the `isInserting` state, so a second event in the
      same tick is caught too;
    - the field's form cannot submit.
  - Block submit by marking the field touched and validating through `field.setMeta` for the insertion's duration.
    TanStack's `canSubmit` is false while any field validates, and `handleSubmit` returns before `onSubmit` when it is
    false.
    That shuts every door without touching them: add-card's Add button and submit hotkey (`add-card.tsx:65-73`,
    `:136-142`), and the shared `Controls` Save button and `Mod+S` used by card details.
    The touch matters: on an untouched form that was never submitted, `canSubmit` stays true while a field validates.
    `handleSubmit` still refuses there, but the card details Save button would look enabled and do nothing.
    Clear the validating flag in a `finally`; leave the field touched.
    Add a WHY: these fields have no async validators, and the flag is how the form learns an insertion is pending.
    A triage probe (TanStack Form 1.25.0, through `useAppForm`) confirmed each of these.
    It also showed that the insertion's own `handleChange` keeps the flag, and that `form.reset()` clears it.
    After a reset the text guard below drops the insertion, so the early release is harmless.
  - When storage finishes, insert only if the editor is still mounted and the field's text is the text the insertion
    started from.
    Otherwise drop the insertion; the stored image goes at the next cleanup.
    That covers closing the add-card dialog and the card details reset when the card changes underneath
    (`card-details.tsx:59-61`).
    The embed already keeps its silent return when `swapPastedUrl` misses; give it a WHY naming this rule.
  - Tests, with gated adds (a promise the test resolves) and `createImageBitmap` stubbed:
    - `add-card.test.tsx`: drop a PNG into the first field and press the submit hotkey, then click Add, while the add
      is held.
      `addCard` is not called.
      Release the add: the reference is in that field.
      Submit: the saved content holds the reference.
    - `card-content-text-area.test.tsx`, with the real editor in a real `useAppForm` field (as the existing test
      mounts it): typing while held changes nothing, and the reference lands at the selection taken at the start;
      a second drop while held calls the add once; setting the field's value from outside while held inserts nothing;
      unmounting while held inserts nothing.
  Constraints: `libs/srs-react` cards only; no `libs/ui` change; no new copy.
  Done when: `SR card-content-text-area add-card card-details` passes; the submit case fails on the old code.
  Manual verify (web):
  - A deck → Add card → drop a large image (4-5 MB) into the back field and press the submit hotkey at once → the card
    is not added; once the reference shows, submit adds one card with the image, and the next card is empty.
  - Same start → type while the image is stored → nothing types until the reference appears.
  Commit: Hold the markdown field while an image insertion runs
  Depends on: none

- [x] 2. Tie the embed action and insertion errors to the field's text
  Goal (M1, M7 unit part):
  - The embed action shows only while the field's current text still holds the pasted link at its offset.
    Derive it at render from `field.state.value` with the check `swapPastedUrl` makes (`image-insertion.ts:48-51`);
    share one helper rather than repeating the slice.
    A form reset or any other change of the text hides it.
  - Insertion errors belong to the text they were shown for: record the field's text when they are set (after any
    accepted images went in), and show them only while the text is unchanged.
    So an edit or a reset clears them, and a rejection on one card never shows on the next.
  - Tests in `card-content-text-area.test.tsx`: paste a link (a `paste` event, then an `input` event with
    `inputType: "insertFromPaste"`) with `addAttachmentFromUrlAtom` set → "Embed image" shows; reset the form → it is
    gone; a rejected drop shows the format error, and a reset or an edit hides it.
  Constraints: the editor and `image-insertion.ts`; no new copy.
  Done when: `SR card-content-text-area image-insertion` passes; the reset cases fail on the old code.
  Manual verify (desktop):
  - A deck → Add card → paste `https://` image link into the back field → "Embed image" shows; add the card → the next
    card's back field shows no "Embed image".
  - Same dialog → drop a `.txt` renamed to `.png` → the format error shows; add a card with other text → the next card
    shows no error.
  Commit: Tie the embed action and insertion errors to the field's text
  Depends on: 1

- [x] 3. Recognize picked and untyped dropped images by their contents
  Goal (M2, M7 unit part):
  - The picker passes every chosen file to `insertFiles` (`card-content-text-area.tsx:181`); the sniff in
    `readImageFile` decides, so a picked non-image shows the format error.
    Keep `acceptedFileTypes` as the dialog's filter.
  - Drop and drag-over also take file items whose type is empty or `application/octet-stream` (`:152-162`).
    Such a file that sniffs as an image inserts; one that does not is skipped without an error, as a text field
    ignores a dropped file.
    A file whose type is `image/*` keeps today's behavior: a failed check shows its error.
    Files with any other type are left to the browser, as today.
  - Tests in `card-content-text-area.test.tsx`:
    - drop PNG bytes named `scan` with an empty type → `![scan](attachment:…)`;
    - drop text bytes named `notes` with an empty type → nothing inserted, no error;
    - pick a PDF named `doc.pdf` → the format error;
    - drop `cat.png` and an empty-type non-image together → only the cat reference, no error.
  Constraints: the editor only.
  Done when: `SR card-content-text-area` passes; the extensionless and picked-PDF cases fail on the old code.
  Manual verify (web):
  - A deck → Add card → drop a PNG renamed to `scan` (no extension) → its reference is inserted.
  - Insert image → choose "All files" in the dialog → pick a PDF → the format error shows.
  Commit: Recognize picked and untyped dropped images by their contents
  Depends on: 2

- [x] 4. Fetch link embeds through an in-memory Electron session
  Goal (M6; M11's test WHY):
  - The embed fetch in `apps/electron/src/media-ipc.ts` goes through Chromium's network stack.
    Use a session from `session.fromPartition` whose name has no `persist:` prefix, so it lives in memory and holds
    none of the app's data.
    Such a session uses the system proxy settings and the OS certificate store.
    Create it on first use in the handler; `registerMediaIpc` runs after `app.whenReady` (`main.ts:44`).
  - Do not hand `session.fetch` to `fetchImageBytes`.
    Triage read Electron 44.5.1's `fetchWithSession`: it passes `redirect: "manual"` to `ClientRequest` and never
    handles the request's `redirect` event.
    `ClientRequest` then dies with "Redirect was cancelled", so every redirected link would fail.
  - Add a one-hop adapter with `fetchImageBytes`'s `Fetch` shape, over `net.request` with that session,
    `credentials: "omit"`, and `redirect: "manual"`:
    - on `redirect`, resolve a body-less `Response` with the redirect's status and a `location` header holding its
      URL, then abort the request inside the listener (an aborted request does not die);
    - on `response`, resolve a `Response` over the message's body stream, with its status and headers;
    - on `error`, reject; the signal aborts the request, during the body too.
    `fetchImageBytes` keeps its loop, the per-hop http(s) check, the redirect cap, and the size cap unchanged.
  - Rewrite the WHY at `media-ipc.ts:91`: an in-memory session sends no cookies or app data and uses the system
    proxy and certificates; redirects go through the adapter so each hop is checked.
  - `apps/electron/IPC.md` §Media: the fetch runs on an in-memory session with the system proxy and certificates.
  - `media-ipc.test.ts`: test the adapter with a fake `ClientRequest` (an `EventEmitter` passed in as a parameter).
    A `redirect` event resolves a 3xx that carries the URL and aborts without following.
    A `response` resolves with its body.
    An abort during the body rejects.
  - Update the test's `electron` mock and rewrite its WHY (M11).
    The module imports `ipcMain`, `net`, and `session`, and `app-sender` reads `app.isPackaged` through `env.ts` on
    import; nothing registers on import.
  Constraints: `media-ipc.ts`, its test, and IPC.md §Media; the channel and its error codes do not change.
  Done when: `EL media-ipc` and `bun run typecheck` pass.
  Manual verify (desktop):
  - A deck → Add card → paste a direct `https://` image link → Embed image → the reference replaces the link, and
    preview shows the image.
  - Paste a link that redirects to an image (for example `https://picsum.photos/200`) → Embed image → it is stored.
  - Paste an `https://` link that answers 404 → the download error shows and the link stays.
  - Skip if no proxy is at hand: on a network that requires the system proxy, embedding works.
  Commit: Fetch link embeds through an in-memory Electron session
  Depends on: none

- [x] 5. Move an image's storage time forward when it is added again
  Goal (M3):
  - Web `addAttachment` (`libs/db-sqlite/src/lib/attachments.ts:21-39`) and Rust `insert_attachment`
    (`crates/koloda/src/repo/attachments.rs:56-81`): when the id already exists, set its `created_at` to the add's
    time, never earlier than it was.
    Id, mime, size, width, height, and bytes stay the first add's.
    Bytes are still written only for a new row.
    Rust sync stores fetched bytes through the same function.
    A fetch drops when its row already exists, and one that races a local add only moves the time, which is harmless.
  - Update both WHYs (`attachments.ts:36`, `attachments.rs:77`), each naming the other as its twin.
  - Twin tests replace "returns the existing row unchanged" (`attachments.integration.test.ts:52`,
    `attachments_integration_tests.rs:58`): a second add returns the first add's metadata with a later
    `created_at`; and a row aged past the cutoff, then added again, survives the sweep unreferenced.
  - MEDIA-STORAGE.md Ruling line 8: a re-add keeps the row's metadata and bytes and moves its storage time forward.
    MEDIA.md §Cleanup line 111: count the 24 hours from when the image was last inserted.
  Constraints: both repos, their integration tests, and the two docs; no schema change.
  Done when: `DB attachments` and `RS --test integration attachments` pass; the sweep case fails on the old code.
  Manual verify: none — the gap needs an image unreferenced for a day and a second tab; behavior otherwise unchanged.
  Commit: Move an image's storage time forward when it is added again
  Depends on: none

- [x] 6. Add a card-images e2e spec on both hosts
  Goal (M7 e2e part):
  - New `card-images.spec.ts` in `apps/web-e2e/src` and `apps/electron-e2e/src`, flow for flow, each on a deck whose
    template has a markdown field (`sync.spec.ts:80-100` shows how a desktop spec sets one up and picks a file).
  - Flow: pick `cat.png` and `notes.txt` together through the field's hidden file input → the field holds exactly one
    `![cat](attachment:<64 hex>)` and the format error shows; add the card; open its preview → an image with a `blob:`
    source shows; start a lesson on the deck → the image shows.
  - Web only: paste an `https://` link (clipboard permission, then the paste key) → the text is pasted and no
    "Embed image" shows (MEDIA.md line 70).
  - Desktop only: serve a PNG from a loopback HTTP server started by the spec; paste its link (write the clipboard
    through the Electron app, then the paste key) → "Embed image" → the link becomes `![<name>](attachment:…)`.
    A link that redirects to the PNG embeds too; it runs item 4's adapter against the real network stack.
    A link that answers 404 → the download error shows and the link stays.
  Constraints: the two specs and any helper they share; follow each suite's README; do not run Playwright.
  Done when: `bun run typecheck` passes; the human runs both specs.
  Manual verify: run `card-images` in both suites.
  Commit: Add a card-images e2e spec on both hosts
  Depends on: 3, 4

- [x] 7. Pin the image size cap to its literal on both hosts
  Goal (M5): the TS cap test (`libs/srs/src/lib/attachments.test.ts:44-49`) and the Rust cap test
  (`crates/koloda/tests/domain/attachments_tests.rs:71-81`) build their at-cap and over-cap images from literals
  written in the test, `5_242_880` and `5_242_881`, instead of the constant.
  The cap is a wire contract (the sync protocol shares it), so `agents/TESTING.md` (§Banned patterns) allows the pin.
  Together with the existing pins, all four copies then answer to one value.
  Constraints: the two tests.
  Done when: `SRS attachments` and `RS --test domain attachments` pass.
  Manual verify: none — test-only.
  Commit: Pin the image size cap to its literal on both hosts
  Depends on: none

- [x] 8. Test redirect following and unreadable stored images
  Goal (M9):
  - `apps/electron/src/media-ipc.test.ts`: a two-hop chain with a relative `Location` that ends in a 2xx returns
    the last body and requested the resolved URLs in order; a chain of six redirects fails with `attachments.fetch`.
  - `libs/srs-react/src/lib/lessons/use-attachment-images.test.tsx`: fire `error` on a loaded image → its alt text
    shows instead.
  Constraints: the two test files.
  Done when: `EL media-ipc` and `SR use-attachment-images` pass.
  Manual verify: none — test-only.
  Commit: Test redirect following and unreadable stored images
  Depends on: 4

- [ ] 9. Record that image dimensions are optional and decoding is editor-only
  Goal (M8): MEDIA-STORAGE.md Ruling lines 12 and 18-19.
  Width and height are stored when the editor decoded the image and may be null otherwise, as for an embedded image.
  Both repos sniff the format and check the size; the editor also decodes the image, as fast feedback only.
  Constraints: MEDIA-STORAGE.md.
  Done when: `bun run check:markdown` passes.
  Manual verify: none — docs only.
  Commit: Record that image dimensions are optional and decoding is editor-only
  Depends on: 5

- [ ] 10. Drop two unused srs exports
  Goal (M10): remove `ATTACHMENT_REF_PATTERN` and `MarkdownToHtmlOptions` from `libs/srs/src/index.ts` (`:25`, `:93`).
  Keep them in their files.
  Constraints: the package entry.
  Done when: `bun run typecheck` and `SRS markdown attachments` pass.
  Manual verify: none — export surface only.
  Commit: Drop two unused srs exports
  Depends on: none

- [ ] 11. List every hook App mounts in the app-react README
  Goal (M11, the README part; item 4 fixes the test WHY): `libs/app-react/README.md:16` also names
  `useAttachmentSweep` (image cleanup), `useConversationSaveHost`, and `useAssistantEngineHost`.
  Constraints: the README line.
  Done when: `bun run check:markdown` passes.
  Manual verify: none — docs only.
  Commit: List every hook App mounts in the app-react README
  Depends on: none

- [ ] 12. Tidy MEDIA.md and say stored images keep their metadata
  Goal (M12, question 4):
  - Drop §Relationships' "Text fields do not offer image insertion" (line 29); §Inserting Images line 33 is its home.
  - Scope: how images reach the user's other devices, and a missing image coming back, are in SYNC.md.
  - §Formats and Size line 90: the stored copy also keeps the file's metadata, such as where and when a photo was
    taken.
  Constraints: MEDIA.md.
  Done when: `bun run check:markdown` passes.
  Manual verify: none — docs only.
  Commit: Tidy MEDIA.md and say stored images keep their metadata
  Depends on: 5

## Outcome

<what shipped>
