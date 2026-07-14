# Adding a New Color Theme

**Input REQUIRED from user**: scheme (light or dark), theme id (kebab-case), display name, palette source or hex values

Themes are usually added as a light/dark pair.
Each half is a separate theme id (for example `github-light` and `github-dark`).

## Architecture

Color theming has three layers:

| Layer | Path | Owns |
| --- | --- | --- |
| Theme | `libs/ui/src/lib/styles/themes/<id>.css` | Palette, accent-derived fills, titlebar hex, rare overrides |
| Scheme | `libs/ui/src/lib/styles/scheme-light.css` / `scheme-dark.css` | Shared UI chrome via `color-mix` from palette anchors |
| Bridge | `libs/ui/src/lib/styles/global.css` (`@theme`) | Tailwind token aliases |

Do not put shared borders, input wells, or hover fills in a theme file.
Those belong in the scheme and derive from `--color-bg` / `--color-mono-*`.

Do put accent-based backgrounds in the theme file.
`color-mix` toward the surface is a poor fit for those.
Use `oklch(from … calc(l ± N) …)` and tune per theme.

## Workflow

### 1. Add the theme CSS file

Create `libs/ui/src/lib/styles/themes/<id>.css`.

Copy an existing theme close to the new look (`atom-one-*.css` or `github-*.css`).

**Light selector:**

```css
:root.light[data-light-theme="<id>"],
:root:not(.dark)[data-light-theme="<id>"] {
  /* … */
}
```

**Dark selector:**

```css
:root.dark[data-dark-theme="<id>"] {
  /* … */
}
```

Do not attach a new theme to bare `:root` or `:root.dark`.
Those selectors are the Atom One fallbacks only.

### 2. Fill the required palette

Every theme must define:

```css
--color-bg: …;
--color-mono-1: …; /* primary text */
--color-mono-2: …; /* secondary text */
--color-mono-3: …; /* muted / disabled */
--color-cyan: …;
--color-blue: …;
--color-purple: …;
--color-green: …;
--color-red: …;
--color-red-2: …;
--color-orange: …;
--color-orange-2: …;
```

`--color-bg` is the surface anchor.
`--color-mono-*` drive foreground steps and most `color-mix` chrome in the schemes.

### 3. Add accent-derived fills

Required in the theme file (not the scheme):

```css
--bg-switch-selected: …;
--border-switch-selected: oklch(from var(--bg-switch-selected) calc(l ± N) c h);
--bg-checkbox-selected: …;
--border-checkbox-selected: oklch(from var(--bg-checkbox-selected) calc(l ± N) c h);
--bg-lesson-type-blue: oklch(from var(--color-blue) calc(l ± N) c h);
--bg-lesson-type-red: oklch(from var(--color-red) calc(l ± N) …);
--bg-lesson-type-green: oklch(from var(--color-green) calc(l ± N) c h);
```

Light themes usually lighten accents for lesson-type backgrounds (`l + N`).
Dark themes usually darken them (`l - N`).
Selected switch/checkbox may use green (Atom One) or accent blue (GitHub).
Match the source design system when there is one.

Start from a sibling theme’s ΔL values, then adjust visually.

### 4. Add Electron titlebar colors

Electron overlay APIs need hex, not `oklch` or `color-mix`.
Runtime sampling of computed `bg-body` does not work reliably — bake solid hex into the theme:

```css
--titlebar-overlay-color: #……;
--titlebar-overlay-symbol-color: #……;
```

`--titlebar-overlay-color` must match **computed `bg-body`** (scheme `color-mix` from `--color-bg`), not raw `--color-bg`.
`--titlebar-overlay-symbol-color` should match `--color-mono-1`.

Dark scheme: `color-mix(in oklab, black 8%, var(--color-bg))`.
Light scheme: `color-mix(in oklab, var(--color-mono-1) 5%, var(--color-bg))`.

### 5. Optional theme overrides

Override a scheme token only when the shared formula is wrong for this palette.
Keep overrides minimal.

### 6. Import the stylesheet

In `libs/ui/src/lib/styles/global.css`, add:

```css
@import "./themes/<id>.css";
```

### 7. Register the theme id

**TypeScript** — `libs/app/src/lib/settings-interface.ts`:

```typescript
export const LIGHT_THEMES: Record<string, string> = {
  // …
  "my-light": "My Light",
};

export const DARK_THEMES: Record<string, string> = {
  // …
  "my-dark": "My Dark",
};
```

The id is the settings value and the `data-*-theme` attribute.
The string is the picker label (not i18n’d today).

**Rust** — `crates/koloda-core/src/domain/settings_interface.rs`:

```rust
pub const LIGHT_THEMES: &[&str] = &[/* … */, "my-light"];
pub const DARK_THEMES: &[&str] = &[/* … */, "my-dark"];
```

TS and Rust registries must stay in sync.
Zod and Rust validation both reject unknown theme ids.

### 8. Verify in the UI

1. Open Settings → Interface.
2. Pick the new light and/or dark theme.
3. Confirm `<html data-light-theme="…">` / `data-dark-theme="…"`.
4. Spot-check inputs, borders, switch/checkbox selected, lesson-type chips, and focus ring.
5. In Electron, confirm titlebar overlay colors match the titlebar (`bg-body`).

No picker code changes are needed.
`LightThemePicker` / `DarkThemePicker` read `LIGHT_THEMES` / `DARK_THEMES`.

Defaults stay Atom One unless the user asks to change them.
Do not change app `store.ts` seed values unless that is requested.

## What Not To Change

- Do not duplicate scheme chrome into the theme file.
- Do not add theme labels to Lingui catalogs (labels are plain strings in the registries).
- Do not update e2e defaults unless the default theme itself changes.
- Do not edit `scheme-light.css` / `scheme-dark.css` for one theme’s accent fills.

## Checklist

- [ ] Theme CSS under `libs/ui/src/lib/styles/themes/`
- [ ] Correct light or dark `data-*-theme` selectors (no bare `:root` for new themes)
- [ ] Full palette (`--color-bg`, monos, accents)
- [ ] Accent-derived selected + lesson-type fills via `oklch(from …)`
- [ ] Titlebar overlay hex pair (matched to computed `bg-body`, not `--color-bg`)
- [ ] `@import` in `global.css`
- [ ] Entry in TS `LIGHT_THEMES` or `DARK_THEMES`
- [ ] Matching entry in Rust `LIGHT_THEMES` or `DARK_THEMES`
- [ ] Visual check in light/dark scheme with the new theme selected

## References

- `libs/ui/src/lib/styles/themes/atom-one-light.css` / `atom-one-dark.css`
- `libs/ui/src/lib/styles/themes/github-light.css` / `github-dark.css`
- `libs/ui/src/lib/styles/scheme-light.css` / `scheme-dark.css`
- `libs/app/src/lib/settings-interface.ts`
- `crates/koloda-core/src/domain/settings_interface.rs`
