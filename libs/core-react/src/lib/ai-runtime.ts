import type { AIRuntime } from "@koloda/ai";
import { atom } from "jotai";

export const aiRuntimeAtom = atom<AIRuntime>(null!);
