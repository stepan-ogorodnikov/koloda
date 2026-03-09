import type { TWVProps } from "@koloda/ui";
import { formatForDisplay } from "@tanstack/react-hotkeys";
import { tv } from "tailwind-variants";

const hotkey = tv({
  base: [
    "inline-flex items-center justify-center",
    "border-2 border-main bg-input font-medium fg-level-2",
  ],
  variants: {
    size: {
      default: "h-10 min-h-10 min-w-10 py-1 px-2 rounded-md",
      small: "py-1 px-2 rounded-md text-xs",
    },
  },
  defaultVariants: {
    size: "default",
  },
});

export type HotkeyProps = TWVProps<typeof hotkey> & {
  value: string;
};

export function HotKey({ variants, value }: HotkeyProps) {
  return (
    <kbd className={hotkey(variants)}>
      <span>{formatForDisplay(value)}</span>
    </kbd>
  );
}
