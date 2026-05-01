import type { AiProvider } from "@koloda/ai";
import { atom } from "jotai";

export const aiProvidersAtom = atom<AiProvider[]>([]);
