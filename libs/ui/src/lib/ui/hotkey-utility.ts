// Mapping of modifier keys to their Mac keyboard symbols
export const MAC_SYMBOLS: Record<string, string> = {
  command: "⌘",
  control: "⌃",
  alt: "⌥",
  shift: "⇧",
  option: "⌥",
  win: "⊞",
  cmd: "⌘",
};

// Mapping of modifier keys to their non-Mac display labels
export const NONMAC_LABELS: Record<string, string> = {
  command: "Ctrl",
  meta: "Win",
  control: "Ctrl",
  alt: "Alt",
  option: "Alt",
  shift: "Shift",
  win: "Ctrl",
  cmd: "Ctrl",
  space: "Space",
  arrowup: "Up",
  arrowdown: "Down",
  arrowleft: "Left",
  arrowright: "Right",
  escape: "Esc",
};

// Mapping of special keys to their normalized display names
const SPECIAL_KEYS: Record<string, string> = {
  esc: "Esc",
  escape: "Esc",
  space: "Space",
  up: "Up",
  down: "Down",
  left: "Left",
  right: "Right",
  enter: "Enter",
  return: "Enter",
  tab: "Tab",
  backspace: "Backspace",
  home: "Home",
  end: "End",
  "page up": "Page Up",
  "page down": "Page Down",
  comma: ",",
  period: ".",
  slash: "/",
  semicolon: ";",
  quote: "'",
  bracketleft: "[",
  bracketright: "]",
  backslash: "\\",
  backquote: "`",
  minus: "-",
  equal: "=",
};

const ALLOWED_MODIFIERS = new Set(["meta", "shift", "alt", "control"]);
const ALLOWED_MAIN_KEYS_REGEX = /^[a-z0-9]$/i;
const ALLOWED_SYMBOL_KEYS = new Set(["[", "]", ";", "'", ",", ".", "/", "\\", "`", "-", "="]);
const ALLOWED_SPECIAL_KEYS = new Set([
  " ",
  "enter",
  "return",
  "escape",
  "esc",
  "backspace",
  "up",
  "down",
  "left",
  "right",
  "home",
  "end",
  "pageup",
  "pagedown",
  "f1",
  "f2",
  "f3",
  "f4",
  "f5",
  "f6",
  "f7",
  "f8",
  "f9",
  "f10",
  "f11",
  "f12",
]);

/**
 * Normalizes a key value for consistent display in the Hotkey component
 * Handles capitalization, special keys, and modifier names
 * @param value - The key value to normalize
 * @returns Normalized display value
 */
export function normalizeDisplayValue(value: string): string {
  const lower = value.toLowerCase();

  if (["command", "control", "alt", "option", "shift", "meta", "win", "cmd"].includes(lower)) return value;
  if (SPECIAL_KEYS[lower]) return SPECIAL_KEYS[lower];
  if (/^f\d{1,2}$/i.test(value)) return value.toUpperCase();
  if (value.length === 1 && /^[a-z]$/.test(lower)) return value.toUpperCase();
  if (/^\d$/.test(value)) return value;
  return value;
}

/**
 * Checks if a key can be used as a main key (non-modifier) in a hotkey
 * @param key - The key value from keyboard event
 * @param code - The code value from keyboard event (optional but improves accuracy)
 * @returns true if the key is allowed as a main key
 */
export function isAllowedMainKey(key: string, code?: string): boolean {
  const lower = key.toLowerCase();
  if (key.length === 1) {
    if (ALLOWED_MAIN_KEYS_REGEX.test(key)) return true;
    if (ALLOWED_SYMBOL_KEYS.has(key)) return true;
  }
  if (ALLOWED_SPECIAL_KEYS.has(lower)) return true;
  if (code) {
    if (code.startsWith("Key") || code.startsWith("Digit") || code.startsWith("F")) return true;
    if (
      [
        "Comma",
        "Period",
        "Slash",
        "Semicolon",
        "Quote",
        "BracketLeft",
        "BracketRight",
        "Backslash",
        "Backquote",
        "Minus",
        "Equal",
      ].includes(code)
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Checks if a key is a modifier key
 * @param key - The key to check
 * @returns true if the key is a modifier
 */
export function isModifier(key: string): boolean {
  return ALLOWED_MODIFIERS.has(key.toLowerCase());
}

/**
 * Orders modifiers according to platform conventions
 * @param mods - Array of modifier keys
 * @param platform - Target platform ("mac" | "other")
 * @returns Ordered array of modifiers
 */
export function orderModifiers(mods: string[], platform: "mac" | "other"): string[] {
  const rankMac: Record<string, number> = { meta: 1, shift: 2, alt: 3, control: 4 };
  const rankOther: Record<string, number> = { control: 1, shift: 2, alt: 3, meta: 4 };
  const rank = platform === "mac" ? rankMac : rankOther;
  return [...mods].sort((a, b) => (rank[a.toLowerCase()] ?? 99) - (rank[b.toLowerCase()] ?? 99));
}

/**
 * Gets the display label for a modifier key
 * @param k - The modifier key
 * @param platform - Target platform ("mac" | "other")
 * @returns Display label for the modifier
 */
export function printModifier(k: string, platform: "mac" | "other"): string {
  switch (k.toLowerCase()) {
    case "meta":
      return "Command";
    case "alt":
      return platform === "mac" ? "Option" : "Alt";
    case "control":
      return "Ctrl";
    case "shift":
      return "Shift";
    default:
      return k;
  }
}

/**
 * Converts keyboard event.code to human-readable display format
 * @param code - The event.code value
 * @returns Human-readable display string
 */
function normalizeCode(code: string): string {
  const codeMap: Record<string, string> = {
    Escape: "Esc",
    Space: "Space",
    ArrowUp: "Up",
    ArrowDown: "Down",
    ArrowLeft: "Left",
    ArrowRight: "Right",
    Enter: "Enter",
    Tab: "Tab",
    Backspace: "Backspace",
    Home: "Home",
    End: "End",
    PageUp: "Page Up",
    PageDown: "Page Down",
    Backquote: "`",
    Minus: "-",
    Equal: "=",
    BracketLeft: "[",
    BracketRight: "]",
    Backslash: "\\",
    Semicolon: ";",
    Quote: "'",
    Comma: ",",
    Period: ".",
    Slash: "/",
  };

  if (codeMap[code]) return codeMap[code];
  if (code.startsWith("Digit")) return code.slice(5);
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("F")) return code;
  return code;
}

/**
 * Formats a hotkey combination for display to users
 * Converts modifier keys and main keys to platform-appropriate labels
 * @param mods - Array of modifier keys (lowercase)
 * @param main - Main key in event.code format or null for modifier-only hotkey
 * @param platform - Target platform ("mac" | "other")
 * @returns Formatted hotkey string (e.g., "Ctrl+Shift+A")
 */
export function formatDisplay(mods: string[], main: string | null, platform: "mac" | "other"): string {
  if (!main) return orderModifiers(mods, platform).map((k) => printModifier(k, platform)).join("+");

  const ordered = orderModifiers(mods, platform).map((k) => printModifier(k, platform));
  const mainDisplay =
    main.startsWith("Key") || main.startsWith("Digit") || main.startsWith("Arrow") || main.startsWith("F")
      ? normalizeCode(main)
      : NONMAC_LABELS[main] || main;

  return [...ordered, mainDisplay].join("+");
}

/**
 * Formats a hotkey combination for storage in canonical format
 * Uses lowercase canonical codes (e.g., "keya" for A key, "meta" for Command)
 * @param mods - Array of modifier keys
 * @param main - Main key in canonical code format or null
 * @returns Canonical hotkey string
 */
export function formatCanonical(mods: string[], main: string | null): string {
  const ordered = orderModifiers(mods, "other").map((m) => m.toLowerCase());
  if (!main) return ordered.join("+");
  return [...ordered, main.toLowerCase()].join("+");
}

/**
 * Parses a canonical hotkey string into an array of key components
 * @param canonical - Canonical hotkey string (e.g., "meta+shift+keya")
 * @returns Array of key components
 */
export function parseCanonical(canonical: string): string[] {
  return canonical.split("+").map((part) => part.trim());
}

/**
 * Converts canonical code format to keyboard event.code format
 * Used to translate stored canonical values back to display format
 * @param code - Canonical code (e.g., "keya", "digit1", "arrowup")
 * @returns event.code string (e.g., "KeyA", "Digit1", "ArrowUp")
 */
export function canonicalToEventCode(code: string): string {
  const lower = code.toLowerCase();

  if (/^key[a-z]$/.test(lower)) return `Key${lower.charAt(3).toUpperCase()}`;
  if (/^digit\d$/.test(lower)) return `Digit${lower.charAt(5)}`;
  if (/^f\d{1,2}$/.test(lower)) return `F${lower.slice(1)}`;
  if (/^arrow(up|down|left|right)$/.test(lower)) return code.charAt(0).toUpperCase() + lower.slice(1);

  const codeMap: Record<string, string> = {
    escape: "Escape",
    space: "Space",
    enter: "Enter",
    return: "Enter",
    tab: "Tab",
    backspace: "Backspace",
    home: "Home",
    end: "End",
    pageup: "PageUp",
    pagedown: "PageDown",
    comma: "Comma",
    period: "Period",
    slash: "Slash",
    semicolon: "Semicolon",
    quote: "Quote",
    bracketleft: "BracketLeft",
    bracketright: "BracketRight",
    backslash: "Backslash",
    backquote: "Backquote",
    minus: "Minus",
    equal: "Equal",
  };

  if (codeMap[lower]) return codeMap[lower];

  return code;
}

/**
 * Transforms a canonical hotkey string to react-hotkeys-hook format
 * Converts canonical codes (e.g., "meta+shift+keya") to hook format (e.g., "cmd+shift+a")
 * @param canonical - Canonical hotkey string with "+" separators
 * @returns React-hotkeys-hook compatible hotkey string
 */
export function transformCanonicalToHook(canonical?: string): string {
  if (!canonical) return "";

  return canonical
    .split("+")
    .map((part) => {
      const trimmed = part.trim().toLowerCase();

      // transform modifiers to react-hotkeys-hook format
      if (trimmed === "meta") return "cmd";
      if (trimmed === "control") return "ctrl";
      // alt and shift remain the same

      // transform main keys (KeyboardEvent.code to key format)
      if (trimmed.startsWith("key")) return trimmed.slice(3);
      if (trimmed.startsWith("digit")) return trimmed.slice(5);

      // special keys - lowercase
      const specialKeys: Record<string, string> = {
        escape: "esc",
        space: "space",
        arrowup: "up",
        arrowdown: "down",
        arrowleft: "left",
        arrowright: "right",
        enter: "enter",
        tab: "tab",
        backspace: "backspace",
        home: "home",
        end: "end",
        pageup: "pageup",
        pagedown: "pagedown",
        delete: "delete",
        insert: "insert",
      };

      if (specialKeys[trimmed]) return specialKeys[trimmed];

      // function keys
      if (/^f\d{1,2}$/.test(trimmed)) return trimmed;

      // symbol keys - use function names per react-hotkeys-hook recommendations (issue #1134)
      const symbolKeys: Record<string, string> = {
        comma: "comma",
        period: "period",
        slash: "slash",
        semicolon: "semicolon",
        quote: "quote",
        bracketleft: "bracketleft",
        bracketright: "bracketright",
        backslash: "backslash",
        backquote: "backquote",
        minus: "minus",
        equal: "equal",
      };

      if (symbolKeys[trimmed]) return symbolKeys[trimmed];

      return trimmed;
    })
    .join("+");
}
