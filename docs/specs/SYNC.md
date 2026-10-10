# Sync

## Scope

Covers keeping one person's data the same on their desktop devices through a sync server they run.
That is spaces, devices, creating a space, and sync status.
How each kind of data behaves on its own is in its spec: CARDS.md, DECKS.md, TEMPLATES.md, ALGORITHMS.md,
LEARNING-SETTINGS.md, and MEDIA.md.
How two devices' edits to the same thing merge is the sync protocol's rule, not this spec's.

## What it is

Sync keeps decks, cards, study progress, templates, algorithms, learning settings, and images the same on every
desktop device of one person.
The devices exchange changes through a sync server the person runs themselves.
There are no accounts.

The app works the same without a network.
Changes made offline sync once the device can reach the server again.

## Core model

- **Sync server** — a server the person runs; it keeps spaces and passes changes between devices
- **Space** — one person's synced data on a sync server; one server can keep several spaces
- **Device** — one copy of the app's data in a space, named by the user
- **Setup token** — the secret a sync server prints once when it is set up; creating a space needs it
- **Status** — what sync is doing on this device now

### Relationships

- A device is in at most one space at a time.
- Every device in a space belongs to the same person and can read and change all of the space's data.
- These sync: decks, cards, reviews and study progress, templates, algorithms and their history, learning settings,
  and images.
- These stay on each device: interface settings, hotkeys, AI profiles and their keys, and assistant conversations.

## Platform availability

Sync is in the desktop app only.
The web demo has no Sync settings and never syncs.

## Servers

A device reaches its sync server over https.
Plain http is accepted only for a server on the same computer, such as a local proxy in front of the real server.
Any other address is refused before anything is sent.

## Creating a space

The user creates a space from Settings → Sync, on a device that has never been in a space.
They enter the server's address, its setup token, a name for the space, and a name for this device.
The device name starts as the computer's name.
Each name has 1 to 100 characters, without surrounding spaces.

The setup token goes to the server once and is not kept.
The new space holds this device only.
Everything already on the device is uploaded to it, and the device keeps syncing from then on.

If the server refuses, the form stays open with what the user entered and shows why:

- the address is not https and not on this computer;
- the setup token is wrong;
- the server cannot be reached.

## Status

Settings → Sync shows, for a device in a space:

- the state: up to date, syncing, downloading the space, waiting for the user's choice, or stopped;
- when it last synced since the app started;
- how many changes wait to upload;
- how many images wait to upload, and how many wait to download;
- while the space downloads, how many changes are left.

A stopped sync shows why it stopped.

"Sync now" syncs at once.
Sync also runs by itself:

- shortly after every change on this device;
- when another device changes something in the space;
- when the app's window regains focus, the computer wakes, or the network returns;
- every few minutes otherwise.

A change made on one device usually shows on the others within seconds.
Screens that show synced data refresh as changes arrive.
