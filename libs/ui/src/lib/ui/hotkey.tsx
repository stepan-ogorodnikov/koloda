import type { TWVProps } from "@koloda/ui";
import { tv } from "tailwind-variants";
import { MAC_SYMBOLS, normalizeDisplayValue } from "./hotkey-utility";

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

export function Hotkey({ variants, value }: HotkeyProps) {
  const platform: "mac" | "other" = /mac/i.test(navigator.userAgent) ? "mac" : "other";
  const normalized = normalizeDisplayValue(value);
  const lower = normalized.toLowerCase();
  const content = platform === "mac" && MAC_SYMBOLS[lower] ? MAC_SYMBOLS[lower] : normalized;
  const useSymbol = platform === "mac" && MAC_SYMBOLS[lower];

  return (
    <kbd className={hotkey(variants)}>
      <span className={useSymbol ? "text-sm" : ""}>{content}</span>
    </kbd>
  );
}
