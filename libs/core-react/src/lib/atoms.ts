import type { AiProvider } from "@koloda/ai";
import { atom } from "jotai";
import type { JSX } from "react";

export const themeAtom = atom("");
export const langAtom = atom("");
export const defaultAlgorithmAtom = atom(0);
export const defaultTemplateAtom = atom(0);
export const aiProvidersAtom = atom<AiProvider[]>([]);
export const appEntryAtom = atom<{ component: (() => JSX.Element) | null }>({ component: null });
