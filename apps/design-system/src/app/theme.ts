import { darkThemeAtom, lightThemeAtom, schemeAtom } from "@koloda/core-react";
import { atom } from "jotai";

const prefersDarkQuery = window.matchMedia("(prefers-color-scheme: dark)");
const prefersDarkAtom = atom(prefersDarkQuery.matches);

prefersDarkAtom.onMount = (setPrefersDark) => {
  const update = () => setPrefersDark(prefersDarkQuery.matches);
  update();
  prefersDarkQuery.addEventListener("change", update);
  return () => prefersDarkQuery.removeEventListener("change", update);
};

// WHY: wire-ui-preferences puts the same side on <html>. This atom repeats that rule so the titlebar select
// follows a device switch while the scheme is System, without reading the DOM.
export const activeThemeAtom = atom((get) => {
  const scheme = get(schemeAtom);
  const isDark = scheme === "dark" || (scheme === "system" && get(prefersDarkAtom));
  return isDark ? get(darkThemeAtom) : get(lightThemeAtom);
});
