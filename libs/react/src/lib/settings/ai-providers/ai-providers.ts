import type { AiProvider } from "@koloda/srs";
import { atom } from "jotai";

export const aiProvidersAtom = atom<AiProvider[]>([]);
