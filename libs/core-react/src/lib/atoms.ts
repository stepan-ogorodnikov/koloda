import type { AiProvider } from "@koloda/ai";
import { atom } from "jotai";
import type { JSX } from "react";

export const schemeAtom = atom("");
export const lightThemeAtom = atom("");
export const darkThemeAtom = atom("");
export const langAtom = atom("");
export const defaultAlgorithmAtom = atom("");
export const defaultTemplateAtom = atom("");
export const aiProvidersAtom = atom<AiProvider[]>([]);
export const appEntryAtom = atom<{ component: (() => JSX.Element) | null }>({ component: null });
