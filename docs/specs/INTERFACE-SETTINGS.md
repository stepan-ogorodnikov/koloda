# Interface Settings

## Scope

Covers interface settings: language, color scheme, color themes, motion, and date and time formats.
It also covers desktop zoom, which is not a setting.
Does not cover hotkeys, assistant settings, learning settings, or adding new themes.
Those are covered by HOTKEYS.md, ASSISTANT-SETTINGS.md, and LEARNING-SETTINGS.md.
Adding a theme is covered by the color theme guide.

## What it is

Interface settings are the user's global preferences for language and appearance.
They apply to the whole app, not to a single screen.
They take effect the moment they are changed.

They are edited on the interface settings screen.
Language and color scheme are also chosen during first setup, before any data exists.

## Core model

- **Language** — the locale used for all interface text
- **Color scheme** — whether the app is light, dark, or follows the device
- **Light theme** — the palette used while the app is light
- **Dark theme** — the palette used while the app is dark
- **Motion** — whether interface animations play, or follow the device
- **Date format** — how dates are rendered across the app
- **Time format** — how times of day are rendered across the app

### Relationships

- Color scheme decides which of the light and dark themes is active.
- The light and dark themes are separate choices, remembered separately.
- One motion setting covers the whole interface; §Motion says what it stops.
- Interface settings never change learning, hotkeys, or assistant settings.

## Language

The offered languages are:

- English
- Russian

The default is English.
Leaving a picker untouched counts as choosing the default:
implicit selections are remembered like explicit ones.
Changing the language switches all interface text immediately.
The choice is saved with the interface settings.
The document language follows the active locale for assistive tools.

Language is remembered per device.
At startup the app uses the language last chosen on this device, otherwise the device language, otherwise English.
The language saved with the interface settings does not override that choice.

## Color Scheme

The scheme is one of:

- Light
- Dark
- System — follows the device's color scheme preference

The default is System.
Light and Dark apply as chosen, regardless of the device.
While set to System, the app switches live when the device switches.

## Color Themes

The light and dark themes are chosen independently.
Only the theme on the active side of the scheme is in effect.
Switching the scheme swaps which theme is active without changing either choice.

### Light Themes

- Atom One Light
- GitHub Light

The default light theme is GitHub Light.

### Dark Themes

- Atom One Dark
- GitHub Dark

The default dark theme is GitHub Dark.

## Motion

The motion setting is one of:

- On — interface animations play
- Off — interface animations are suppressed
- System — follows the device's reduced-motion preference

The default is System.
When the device asks to reduce motion, animations are suppressed; otherwise they play.

Suppressed animations stop all movement: nothing slides, scales, rotates, or springs.
Looping indicators, such as spinners, pulses, and shimmers, stand still.
Brief fades and color changes still play.

## Date and Time Format

Each format is picked from a select.
The default for both formats is Default, which renders each timestamp the way the active language would.

Date presets:

- Default — the default rendering for the active language
- `yyyy-MM-dd`
- `dd.MM.yyyy`
- `MM/dd/yyyy`

Time presets:

- Default — the default rendering for the active language
- 12-hour — `hh:mm a`
- 24-hour — `HH:mm`

A custom pattern is built from the tokens y, M, d, H, h, m, s, a and from text wrapped in single quotes.
An unclosed quote turns the rest of the pattern into text.
A custom pattern must not be empty, must contain at least one token, and must not exceed 64 characters.
A pattern the app cannot render is invalid.
Choosing Custom in the date select shows a custom pattern field.
Choosing any other date option hides it again.
The time select has no Custom option, so time offers no pattern field.

Picking a preset or saving a custom pattern changes every timestamp immediately.
That includes the cards table, card details, review history, created and updated labels on forms, chat message times,
and the times on the sync screens and the title-bar sync indicator.
The time format also sets the clock of the learning screen's "Start of the day" field.
A 12-hour time format gives it a 12-hour clock and a 24-hour one a 24-hour clock; Default follows the active language.
A preview under each select always shows the current date and time in the chosen format.
An invalid custom pattern is rejected on save: nothing is written, the previous format stays in effect, and the
field shows an error.
Relative labels, such as the conversation list's "3 days ago", do not follow these settings.

## Desktop Zoom

On the desktop the user can zoom the interface in and out.
Zoom is not on the interface settings screen, and its keys are not configurable; see HOTKEYS.md (§Scope).

The zoom keys and wheel:

- Ctrl or Cmd with `+` or `=` zooms in
- Ctrl or Cmd with `-` zooms out
- Ctrl or Cmd with `0` resets to the default size
- Ctrl or Cmd with the mouse wheel zooms in when scrolling up and out when scrolling down

Zoom works while a text field is focused.
It changes in steps within a fixed range.
The last zoom level is remembered on this device across restarts.
It is not part of the saved interface settings.
The web app leaves zoom to the browser.

## First Setup

First setup asks for language and color scheme before the app's data is created.
On the desktop it can also join a sync space instead; that device's data comes from the space (SYNC.md (§First Run)).
The pickers there change the look and text of the setup screen itself but save no settings yet.
The device remembers the live choice, including implicit ones.

On submit, the chosen language and scheme become the interface settings.
Every field not chosen at setup starts at its default.
The chosen language also selects the language of the seeded starter content.

The starter content differs by platform:

- Web — sample algorithms, templates, and decks with cards, so the app can be tried right away
- Desktop — one algorithm and one template, and no decks

## Editing and Saving

The interface settings screen has no save button.
Each control saves its own field the moment it changes.
Changing one field never rewrites the others.

The pickers only offer valid values.
A value outside the known sets is rejected on write.
A rejected or failed write leaves the previous settings unchanged.
The control then shows the previous value again, and the screen shows the error until a later change saves.

## Startup

The app starts with the scheme, themes, and motion it last used on this device.
This avoids a flash of wrong colors before the saved settings load.
Once the saved settings load, they take precedence.
Language is the exception; see §Language.
