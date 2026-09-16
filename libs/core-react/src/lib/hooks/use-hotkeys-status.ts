import { atom, useAtom } from "jotai";
import { useCallback, useMemo } from "react";

// WHY: Runtime activation scope, distinct from the settings `HotkeyCategory` grouping.
// A category organizes bindings in settings/validation; a runtime scope gates whether
// registered hotkeys fire. Categories `ui`/`ai` have no runtime scope — their hotkeys
// register always-on (`""`) and gate via mount plus per-hotkey `enabled`.
export type RuntimeScope = "navigation" | "grades" | "form";

export type AppHotkeyScope = RuntimeScope | "";

export const DEFAULT_HOTKEYS_SCOPES: RuntimeScope[] = [];

export const hotkeysScopesAtom = atom<RuntimeScope[]>(DEFAULT_HOTKEYS_SCOPES);
export const areHotkeysDisabledAtom = atom<boolean>(false);

export function useHotkeysStatus() {
  const [isDisabled, setIsDisabled] = useAtom(areHotkeysDisabledAtom);
  const [scopesArray, setScopesArray] = useAtom(hotkeysScopesAtom);

  const disableHotkeys = useCallback(() => {
    setIsDisabled(true);
  }, [setIsDisabled]);

  const enableHotkeys = useCallback(() => {
    setIsDisabled(false);
  }, [setIsDisabled]);

  const disableScope = useCallback(
    (name: RuntimeScope) => {
      setScopesArray((prev) => prev.filter((x) => x !== name));
    },
    [setScopesArray],
  );

  const enableScope = useCallback(
    (name: RuntimeScope) => {
      setScopesArray((prev) => (prev.includes(name) ? prev : [...prev, name]));
    },
    [setScopesArray],
  );

  const scopes: Record<RuntimeScope, boolean> = useMemo(
    () =>
      (isDisabled ? {} : scopesArray.reduce((acc, x) => ({ ...acc, [x]: true }), {})) as Record<
        RuntimeScope,
        boolean
      >,
    [scopesArray, isDisabled],
  );

  return { scopes, disableHotkeys, enableHotkeys, disableScope, enableScope };
}
