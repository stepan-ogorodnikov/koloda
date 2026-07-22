# Code Style Guide for AI Agents

This guide defines TypeScript/React code style conventions for this repository.

Follow these rules when writing or editing code.
Prefer matching nearby files when they already follow this guide.

## Props Types

For hooks and components, declare props as a named type before the function.
Do not inline the props type in the function signature.

Bad:

```typescript
export function Select<T extends object>({
  label,
  onChange,
}: {
  label?: ReactNode;
  onChange: (key: string | number | null) => void;
}) {
  // ...
}
```

Good:

```typescript
export type SelectProps<T extends object> = {
  label?: ReactNode;
  onChange: (key: string | number | null) => void;
};

export function Select<T extends object>({ label, onChange }: SelectProps<T>) {
  // ...
}
```

Use a `*Props` name for component props.
Use a `*Options` name when the type is a small options bag for a hook or helper.

## Boolean Naming

Boolean variables and property names must start with a verb such as `is`, `are`, `has`, `can`, `should`, `will`, etc.
This makes the truthy/falsy intent obvious at the call site.
It also reads naturally in conditions.

Bad:

```typescript
const visible = true;
const disabled = false;
const empty = items.length === 0;
const user = { admin: true, verified: true };
```

Good:

```typescript
const isVisible = true;
const isDisabled = false;
const isEmpty = items.length === 0;
const user = { isAdmin: true, isVerified: true };
```

## Imports: `separate-type-imports`

Prefer `@typescript-eslint/consistent-type-imports` with `fix: "separate-type-imports"`.
Type-only imports use `import type { … }`.
Value imports stay on their own line.

Bad:

```typescript
import { SelectListBox, type SelectListBoxProps } from "./select-list-box";
```

Good:

```typescript
import { SelectListBox } from "./select-list-box";
import type { SelectListBoxProps } from "./select-list-box";
```

See `libs/ui/src/lib/primitives/select/select.tsx`.

## Avoid Reexports

Do not reexport symbols through intermediate modules.
Export each symbol from the file that defines it.
Wire public API through the package entry.
For `libs/ui` that is `libs/ui/src/index.ts`, or the matching package `index.ts`.

Note: the **compound component pattern** (e.g. `Select.Root`, `Select.Button`) is NOT a reexport.
Even though it visually looks like one.
The parent component is the public API surface.
`Root`, `Button`, etc. are properties assigned onto that component, not forwarded exports from other files.
This pattern is an allowed exception to the rule above.

Good — compound component pattern (allowed exception):

```typescript
// select.tsx
function Select<T extends object>(props: SelectProps<T>) {
  // ...
}

Select.Root = SelectRoot;
Select.Button = SelectButton;
Select.ListBox = SelectListBox;
```

Bad — barrel that only forwards other modules (this IS a reexport):

```typescript
// select/index.ts
export { SelectRoot } from "./select-root";
export { SelectButton } from "./select-button";
export { Select } from "./select";
```

Good — define and export in place, then list defining files in the package entry:

```typescript
// select-root.tsx
export function SelectRoot<T extends object>(props: SelectRootProps<T>) {
  // ...
}

// libs/ui/src/index.ts
export * from "./lib/primitives/select/select-root";
export * from "./lib/primitives/select/select-button";
export * from "./lib/primitives/select/select";
```

Import the defining symbols from the package: `SelectRoot`, `SelectButton`, `Select`.
Do not import them via a parent namespace or local barrel.
