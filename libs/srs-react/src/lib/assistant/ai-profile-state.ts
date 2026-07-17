import type { AIProfile, ModelParameter } from "@koloda/ai";
import { atom } from "jotai";
import { atomWithStorage } from "jotai/utils";
import { z } from "zod";

export type AIProfileState = {
  profileId: string | null;
  modelId: string | null;
  modelParameters: Record<string, string>;
};

export type AIProfileStateUpdater = {
  profileId: string | null;
  modelId: string | null;
  modelParameters?: Partial<Record<ModelParameter["type"], string | null>>;
};

export const aiProfileStateStorageValidation = z.object({
  profileId: z.string().nullable(),
  modelId: z.string().nullable(),
  modelParameters: z.record(z.string(), z.string()),
});

const rawStorageAtom = atomWithStorage<string | null>(
  "koloda:global-ai-profile-state",
  null,
  {
    getItem: (key) => {
      try {
        return localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    setItem: (key, value) => {
      try {
        if (value === null) {
          localStorage.removeItem(key);
        } else {
          localStorage.setItem(key, value);
        }
      } catch {}
    },
    removeItem: (key) => {
      try {
        localStorage.removeItem(key);
      } catch {}
    },
  },
  { getOnInit: true },
);

function parseRaw(raw: string | null): AIProfileState | null {
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    const result = aiProfileStateStorageValidation.safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

function serializeRaw(value: AIProfileState | null): string | null {
  if (value === null) return null;
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}

export const aiProfileStateAtom = atom(
  (get) => parseRaw(get(rawStorageAtom)),
  (_get, set, next: AIProfileState | null) => {
    set(rawStorageAtom, serializeRaw(next));
  },
);

function pickDefaultProfile(profiles: AIProfile[]): AIProfile | null {
  if (profiles.length === 0) return null;
  const sorted = [...profiles].sort((a, b) => {
    if (a.lastUsedAt && b.lastUsedAt) return new Date(b.lastUsedAt).getTime() - new Date(a.lastUsedAt).getTime();
    if (a.lastUsedAt) return -1;
    if (b.lastUsedAt) return 1;

    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  return sorted[0] ?? null;
}

export function reconcileAIProfileState(stored: AIProfileState | null, profiles: AIProfile[]): AIProfileState {
  if (!stored) {
    const fallback = pickDefaultProfile(profiles);

    return {
      profileId: fallback?.id ?? null,
      modelId: null,
      modelParameters: {},
    };
  }

  const profile = stored.profileId ? (profiles.find((p) => p.id === stored.profileId) ?? null) : null;

  if (!profile) {
    const fallback = pickDefaultProfile(profiles);

    return {
      profileId: fallback?.id ?? null,
      modelId: null,
      modelParameters: {},
    };
  }

  return {
    profileId: profile.id,
    modelId: stored.modelId ?? null,
    modelParameters: { ...stored.modelParameters },
  };
}
