import { atom, useAtom } from "jotai";
import { useCallback, useMemo } from "react";

export const hotkeysScopesAtom = atom<string[]>([]);
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

  const disableScope = useCallback((name: string) => {
    setScopesArray((prev) => prev.filter((x) => x !== name));
  }, [setScopesArray]);

  const enableScope = useCallback((name: string) => {
    setScopesArray((prev) => prev.includes(name) ? prev : [...prev, name]);
  }, [setScopesArray]);

  const scopes: Record<string, boolean> = useMemo(() => (
    isDisabled ? {} : scopesArray.reduce((acc, x) => ({ ...acc, [x]: true }), {})
  ), [scopesArray, isDisabled]);

  return { scopes, disableHotkeys, enableHotkeys, disableScope, enableScope };
}
