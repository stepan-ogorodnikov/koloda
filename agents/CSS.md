# CSS Styling

## Decision flow

Pick a styling approach by following these steps in order:

1. **Does the className change based on props or state?**
   For example: variant, size, sortable, disabled.
   - **Yes** → use `tailwind-variants` (`tv`).
     See [Conditional styling with `tailwind-variants`][conditional].
   - **No** → continue to step 2.
2. **Is the className long, or does it have multiple logical groups?**
   - **Yes** → extract it to a module-level constant.
     See [Static className][static].
   - **No** → keep it inline.

## Color and design tokens

Class names like `bg-button-primary`, `fg-level-1`, `border-input`, `shadow-button-pressed`, `outline-focus-ring` are **tokens**, not arbitrary Tailwind palettes. Reach for them; do not reach for Tailwind's built-in colors.

```tsx
// ❌ BAD — built-in palette bypasses theming, breaks light/dark
<button className="bg-gray-200 text-zinc-600 border-slate-300" />

// ✅ GOOD — semantic tokens render correctly in every theme
<button className="bg-button-primary fg-level-1 border-button-bordered" />
```

Tokens cover more than colors — borders, shadows, focus rings, fonts (`font-sans`), transitions, and container/breakpoint sizing are all token-driven. The full list lives in `@theme` in `libs/ui/src/lib/styles/global.css`.

### Adding a new token

If no existing token fits, add one end-to-end. All three layers are required, or the class won't exist:

1. **Both scheme files** — `libs/ui/src/lib/styles/scheme-light.css` and `scheme-dark.css`, under the component's section. Derive from lower-level tokens with `color-mix(in oklab, ...)` rather than hardcoding a literal.
   ```css
   /* scheme-light.css */
   --bg-widget: color-mix(in oklab, var(--fg-level-1) 5%, var(--bg-level-1));
   /* scheme-dark.css — same name, dark-appropriate value */
   --bg-widget: color-mix(in oklab, var(--fg-level-1) 8%, var(--bg-level-1));
   ```
2. **The `@theme` bridge** in `global.css`. This is what turns the variable into a usable class:
   ```css
   --color-bg-widget: var(--bg-widget);
   ```
3. Use it: `bg-widget`. Per-prefix conventions: `bg-*`, `fg-*`, `border-*`, `outline-*` map to background / foreground / border-color / outline-color; `--shadow-*` maps to `shadow-*`; pair `--color-*` with the matching prefix.

Never declare a one-off CSS variable inside a component. Token classes are the only sanctioned way to color things.

### Opacity modifiers

Token utilities support `/50`-style opacity via `color-mix`, not Tailwind's alpha channel — so `bg-button-hover/40` works on custom tokens the same as on built-in colors.

### Light/dark is automatic

The scheme layer swaps every token under `:root.dark`, so a class like `bg-button-primary` already renders correctly in both modes. Do **not** add `dark:` variants in components for token-driven differences. Reserve `dark:` for genuinely non-tokenized layout or behavior swaps.

### Behavioral utilities

Prefer these over hand-rolled equivalents. Defined in `libs/ui/src/lib/styles/utilities.css`:

- `focus-ring` — the only sanctioned focus ring. Composes `data-focus-visible` so it only shows on keyboard nav. Variants: `group-focus-ring` (ring on the group's focused child), `drag-focus-ring` (ring while dragging), `error-ring` (error-colored ring), `no-focus-ring` (suppress).
- `animate-colors` — the shared color transition (`transition-colors duration-250 ease-in-out`). Put it in a recipe's `base` so hover/press shifts stay consistent; don't write ad-hoc transitions.
- `numbers-text` — shared "large number" label style.

Reference: `libs/ui/src/lib/primitives/form/button.tsx` (tokens + `focus-ring` + `animate-colors`), `scheme-light.css` (scheme shape).

## Conditional styling with `tailwind-variants`

When a className needs to change based on props or state, use `tailwind-variants` (`tv`).
Avoid inline ternaries or string concatenation.
Define the styles once at module scope.
Call the returned function with the variant props.

```tsx
// ❌ BAD — inline ternaries are hard to scan and review
<div
  className={[
    "flex flex-row items-center gap-1 whitespace-nowrap",
    isSortable ? "cursor-pointer select-none" : "",
  ].join(" ")}
/>

// ✅ GOOD — declare a tv() recipe; classes change by variant prop
import { tv } from "tailwind-variants";

export const tableHeadCellContent = tv({
  base: "flex flex-row items-center gap-1 whitespace-nowrap",
  variants: {
    isSortable: { true: "cursor-pointer select-none" },
  },
  defaultVariants: {
    isSortable: false,
  },
});

<div className={tableHeadCellContent({ isSortable: canSort })} />;
```

### Conventions

- **Module-level recipes.**
  Define `tv({...})` next to the component.
  Or in a sibling `*.styles.ts(x)` file when shared.
  Never inline `tv({...})` inside render — it allocates a new recipe on every render.
- **Compose with `extend`.**
  When one recipe is a specialization of another, inherit its `base` and `variants`.
  Don't duplicate them.

  ```tsx
  // table-cell-content.tsx — the shared base recipe
  export const tableCellContent = tv({
    base: "overflow-hidden break-all",
    variants: {
      type: { head: "fg-table-head font-semibold tracking-tight" },
      paddings: { none: "p-0", default: "py-1 px-2" },
    },
    defaultVariants: { paddings: "default" },
  });

  // table-head.tsx — extends the base and adds a local variant
  export const tableHeadCellContent = tv({
    extend: tableCellContent,
    base: "flex flex-row items-center gap-1 whitespace-nowrap",
    variants: {
      isSortable: { true: "cursor-pointer select-none" },
    },
    defaultVariants: { isSortable: false },
  });
  ```

  Usage passes both layers at once: `tableHeadCellContent({ isSortable, type: "head" })`.
- **Always set `defaultVariants`.**
  Do this for any variant that has a non-empty default.
  Callers can then omit optional props without ending up with `undefined` slots in the class string.
- **Type the props with `TWVProps`.**
  Use the `TWVProps<typeof recipe>` helper from `@koloda/ui`.
  You get fully-typed variant props without redeclaring them by hand.

  ```tsx
  import type { TWVProps } from "@koloda/ui";

  type TableCellContentProps = PropsWithChildren & TWVProps<typeof tableCellContent>;

  export function TableCellContent({ variants, children }: TableCellContentProps) {
    return <div className={tableCellContent(variants)}>{children}</div>;
  }
  ```
- **Boolean variants follow the verb-prefix convention from `CODE-STYLE.md`.**
  Prefix the key with a verb: `is`, `are`, `has`, `can`, `should`, `will`, and so on.
  Never use a bare adjective like `sortable` or `disabled`.

  ```tsx
  // ❌ BAD — bare adjective reads as a state, not a question
  variants: { sortable: { true: "cursor-pointer select-none" } }

  // ✅ GOOD — verb prefix makes the call site read as a question
  variants: { isSortable: { true: "cursor-pointer select-none" } } // → tableHeadCellContent({ isSortable: canSort })
  ```

  Model boolean variants as `{ true: ... }`.
  If you need distinct off-state styling, use a string variant (`variant: "default" | "muted"`) instead.

Reference:

- `libs/ui/src/lib/primitives/table/table-head.tsx`
- `libs/ui/src/lib/primitives/table/table-cell-content.tsx`
- `libs/ui/src/lib/primitives/table/table-sort-icon.tsx`

## Static className

When the className is the same on every render, extract it.
Split long values or multi-concern class lists into a module-level constant.
Build it from an array of logical groups.

```tsx
// ❌ BAD — long inline className (hard to scan and review)
<div
  className="absolute inset-x-0 top-0 bottom-1.5 flex flex-col items-center overflow-y-auto no-focus-ring [scrollbar-gutter:stable_both-edges] [mask-image:linear-gradient(to_bottom,black_calc(100%-2.5rem),transparent)]"
/>

// ✅ GOOD — extract and group by concern
const scrollViewport = [
  "absolute inset-x-0 top-0 bottom-1.5 flex flex-col items-center",
  "overflow-y-auto no-focus-ring",
  "[scrollbar-gutter:stable_both-edges]",
  "[mask-image:linear-gradient(to_bottom,black_calc(100%-2.5rem),transparent)]",
].join(" ");

<div className={scrollViewport} />
```

Reference: `apps/demo/src/components/titlebar.tsx`, `libs/ai-react/src/lib/ai-chat-messages.tsx`.

Short, single-concern class lists may stay inline.
Roughly one visual idea.

[conditional]: #conditional-styling-with-tailwind-variants
[static]: #static-classname
