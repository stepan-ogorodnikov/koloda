# Interface Settings

## Scope

Covers interface settings: language, color scheme, color themes, motion, and date and time formats.
Does not cover hotkeys, assistant settings, learning settings, or adding new themes.
Those are covered by the hotkeys, assistant settings, and learning settings specs.
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

Relationships:

- Color scheme decides which of the light and dark themes is active.
- The light and dark themes are separate choices, remembered separately.
- Motion applies to all interface animations at once.
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

At startup the app does not read the saved language back.
Startup picks the locale itself: a remembered last choice where the app keeps one, otherwise the device language, otherwise English.
The desktop app starts from the device language each time.
The web app remembers the last choice in the browser.
The saved value records the choice; it does not restore it.

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

### Light themes

- Atom One Light
- GitHub Light

The default light theme is GitHub Light.

### Dark themes

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

## Date and Time Format

Each format is picked from a select; only the date select also offers a custom pattern.
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

The default date format is Default.
The default time format is Default.

A custom pattern is built from the tokens y, M, d, H, h, m, s, a and from text wrapped in single quotes.
A custom pattern must not be empty, must contain at least one token, and must not exceed 64 characters.
A pattern the app cannot render is invalid.
Choosing Custom in the date select shows a custom pattern field.
Choosing any other date option hides it again.
The time select has no Custom option, so time offers no pattern field.

Picking a preset or saving a custom pattern changes every timestamp immediately: the cards table, card details,
review history, created and updated labels on forms, and chat message times.
A preview under each select always shows the current date and time in the chosen format.
An invalid custom pattern is rejected on save: nothing is written, the previous format stays in effect, and the
field shows an error.
Relative labels, such as the conversation list's "3 days ago", do not follow these settings.

## First Setup

First setup asks for language and color scheme before the app's data is created.
The pickers there change the look and text of the setup screen itself but save nothing to the database yet.
Browser-local mirrors follow the live choice, including implicit ones.

On submit, the chosen language and scheme become the interface settings.
Every field not chosen at setup starts at its default.
The chosen language also selects the language of the seeded starter content.

## Editing and Saving

The interface settings screen has no save button.
Each control saves its own field the moment it changes.
Changing one field never rewrites the others.

The pickers only offer valid values.
A value outside the known sets is rejected on write.
A rejected or failed write leaves the previous settings unchanged.

## Startup and Caching

The saved settings record is the source of truth.
Scheme, themes, and motion are also mirrored to a lightweight local cache.
The cache lets the app paint with the last-used look before the database loads.
Before styles load, the last-used scheme and surface color are painted to avoid a flash of wrong colors.
Once the saved settings load, they take precedence over the cached values.
Failures to write the cache do not affect saving to the database.
