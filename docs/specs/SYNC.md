# Sync

## Scope

Covers keeping one person's data the same on their desktop devices through a sync server they run.
That is spaces, devices, creating, joining, and leaving a space, joining on first run, inviting and managing devices,
sync status, and what happens when sync stops.
First setup without sync is in INTERFACE-SETTINGS.md (§First Setup).
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
- **Pairing code** — a short code a device in a space issues, so that another device can join the space
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

## Inviting a device

A device in a space invites another one from Settings → Sync with "Invite a device".
It shows a pairing code and the server's address; the other device enters both to join.
Both have a copy button.

A pairing code:

- works once;
- expires 10 minutes after it is issued;
- ignores letter case and the dash it is shown with.

The dialog counts down the time left.
Once the code expires, the dialog says so and offers a new code.
If no code can be issued, as when the server cannot be reached, the dialog shows why and offers to try again.
Closing the dialog does not cancel the code; it still expires on its own.

## Joining a space

A device joins a space from Settings → Sync with "Join a space".
It needs a pairing code from a device already in the space (§Inviting a device).
The user enters the server's address, the pairing code, and a name for this device, which starts as the computer's
name.

First the dialog shows what the code would join: the space's name, how many decks, cards, and reviews it holds, and
its size.
Showing this does not use the code.
"Back" returns to the form with what was entered; "Join" uses the code.

What happens then depends on what the device holds:

- only the starter content of its first run: it joins, and the space's starter algorithm and template take the place
  of its own;
- data of its own: it asks whether to add that data or replace it (§Add or Replace);
- it was in this space before, and left or was removed: it joins again with its data, and changes made while it was
  out of the space sync too;
- it is in another space: the join is refused before the code is used, and the user leaves that space first.

The space then downloads in the background; the status shows it (§Status).

If the join fails, the dialog says why:

- the code is wrong, expired, or already used;
- there were too many wrong codes, so the server waits a minute before trying another;
- the server cannot be reached, or its address is not https and not on this computer;
- this device's clock is more than 5 minutes off the server's.

## First run

The desktop app's first-run screen offers "Get started", which seeds the starter content, and "Join a space".
"Join a space" asks for the same things as §Joining a space and shows the same preview; "Back" returns to the first
choice.

A device that joins on first run takes its starter content and learning settings from the space.
The language and color scheme chosen on the first-run screen become its interface settings, and every other
interface setting and hotkey starts at its default.

After the join, the screen stays until the space's first download ends, and shows how many changes are left.
If the download stops, the screen says why and sync keeps retrying on its own; quitting the app is the only way out.
Once the download ends, the app opens on the space's data.
A device quit during its first download opens normally next time, and the download goes on in the background.

## Add or Replace

A device that joins with data of its own asks what to do with it, and syncs nothing until the user picks:

- **Add** keeps this device's decks and adds them to the space, so every device has both.
- **Replace** deletes this device's decks, cards, progress, templates, and algorithms, and takes the space's instead.
  It asks again before deleting.

When the space already holds some of the same items, the data looks like a copy of what the space holds, as with a
copied database.
Then the choice says so and recommends Replace: Add keeps both, so the copied decks show twice.

With either choice, the space's learning settings take the place of this device's, and every screen refreshes.
Settings that never sync stay as they are (§Core model).

A device waiting for the choice shows it again on Settings → Sync after a restart, without the copy warning.

## Devices

Settings → Sync lists the devices in the space: each one's name, its system, and when the server last heard from it.
This device is marked as this device.
Removed devices, and devices that left, are not listed.
If the server cannot be reached, the list shows why and offers to try again.

"Remove" on another device asks first, then takes that device out of the space.
Removing is how to cut off a lost or stolen device.
The removed device stops syncing the next time it reaches the server, and keeps its data.
It can join a space again with a new pairing code.
A device does not remove itself; it leaves instead.

## Leaving a space

"Leave the space" asks first, then takes this device out of the space.
Its data stays, and it stops syncing.
The other devices no longer list it.
Leaving needs the server: while the server cannot be reached, leaving fails and says why.

A device that left, or was removed, shows that it is in no space.
It can join a space again; it cannot create one.

## Status

Settings → Sync shows, for a device in a space:

- the state: up to date, syncing, downloading the space, waiting for the user's choice, or stopped;
- when it last synced since the app started;
- how many changes wait to upload;
- how many images wait to upload, and how many wait to download;
- while the space downloads, how many changes are left.

A stopped sync shows why it stopped (§When sync stops).

The title bar shows a sync indicator on every screen: syncing, up to date, or needs attention.
Its tooltip gives the last sync, or why sync needs attention; clicking it opens Settings → Sync.
Sync needs attention when it stopped, waits for the Add or Replace choice, holds at a change it cannot read, or the
space is full.
A device that never joined a space, left one, or was removed shows no indicator.

"Sync now" syncs at once.
Sync also runs by itself:

- shortly after every change on this device;
- when another device changes something in the space;
- when the app's window regains focus, the computer wakes, or the network returns;
- every few minutes otherwise.

A change made on one device usually shows on the others within seconds.
Screens that show synced data refresh as changes arrive.

## When sync stops

Settings → Sync says why sync stopped and what the user can do.
Unless a reason below needs the user, sync retries on its own.

- This device's clock is more than 5 minutes off the server's: nothing syncs until the clock is right, then sync
  resumes by itself.
  Changes made meanwhile keep their order.
- The device left the space, or another device removed it: see §Leaving a space.
- The server was restored from a backup made before this device joined, or every device's access was reset: the
  device is out of the space and joins it again with a new pairing code.
  Its data stays, and its changes sync after the join.
- The server no longer knows this device for another reason: the device leaves the space first, which works even
  though the server does not know it, then joins it again the same way.
- The server was restored from a backup that replaces every device's data: the device syncs nothing until the user
  continues, and asks once more first.
  Continuing deletes this device's synced data and downloads the backup's; changes made after the backup are lost.
  Settings that never sync stay.
- The space's download needs more free disk space than there is: the message says how much it needs and how much is
  free.
- The server refused this device's changes: the message shows the server's reason code.
- Anything else, such as a server out of reach: the message says what failed.

Some problems leave the rest of sync running:

- Another device synced a change that this version of the app cannot read.
  Downloads stop at that change until the app is updated, and resume there; nothing is skipped.
  Uploads go on.
- A change in the space is damaged, so no version can read it.
  Downloads stop at it, and the message names it with the server command that drops it.
  A damaged review holds up only other reviews; any other damaged change holds up every download.
  Uploads go on.
- The space is full: new changes wait to upload, and deletions still upload, which frees room.
- This device made changes while its clock was ahead of the server's: they wait to upload until the server's clock
  passes them, and the message says when.
  Downloads go on.
