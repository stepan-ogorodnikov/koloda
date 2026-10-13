# Storage buckets

## Ruling

- Every persisted item is either **global** or **device-local**.
- A global item is the user's library.
  It travels between the user's native devices through sync, and every device holds the same value once synced.
- A device-local item stays on the device that wrote it.
  It never enters the sync log, and no sync group carries it.
- The classification:

| Item | Bucket |
| --- | --- |
| `templates`, `algorithms`, `algorithm_revisions`, `decks`, `cards`, `reviews` | Global |
| `settings.learning`, all of it | Global |
| Attachment bytes and metadata | Global, synced outside the envelope log |
| `settings.interface` | Device-local, except a one-shot pairing hint to a new device |
| `settings.hotkeys` | Device-local |
| `settings.ai` (profiles and `assistant`) | Device-local |
| `conversations` | Device-local |
| AI API keys (OS keyring) | Device-local |
| `window-state.json`, `ui-prefs.json` (desktop main process) | Device-local |
| `localStorage`: `koloda-ui-prefs`, `lang`, `nav-collapsed`, `activeConversationId`, `koloda:global-ai-profile-state` | Device-local |
| Desktop `localStorage`: `zoom-level` | Device-local |
| `_migrations` | Device-local |
| Sync bookkeeping tables (`crates/koloda-sync-proto/PROTOCOL.md` §Client state) | Device-local |
| Sync tokens (OS keyring: `sync.token.*`, `sync.pending_token.*`) | Device-local |
| Attachment transfer queue and fetch state | Device-local |
| Runtime state: lesson session in flight, streaming | Device-local |

- Card scheduling is part of the card's global row.
  It is not derived from the review log.
- The day boundary in `settings.learning` is global.
  Each device resolves it in its own time zone at runtime.
- A new persisted item is classified in the change that adds it.
- Moving an item from one bucket to the other is a new decision.
  The sync contract changes with it.

## Why

A second device needs the same cards, decks, settings, and review history to study the same library.
Some state is bound to one machine.
Window geometry, the keyring, the locale cache, and hotkeys belong to one device; hotkeys mean nothing on touch.
Syncing that state would copy one machine's state onto every other device.
Conversations and AI profiles are device-local until a later decision syncs them.

## Applies when

- Adding a setting, a store, a cache, a table, or a file outside the database.
- Adding a syncable kind or field group, or moving an item between buckets.
- Adding a host that stores settings or data on its own.
