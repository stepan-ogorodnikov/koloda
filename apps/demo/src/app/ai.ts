import type {
  AddAIProfileData,
  AIProfile,
  RemoveAIProfileData,
  TouchAIProfileData,
  UpdateAIProfileData,
} from "@koloda/srs";
import { aiSettingsValidation, fetchModels } from "@koloda/srs";
import type { DB } from "@koloda/srs-pgsql";
import { getSettings, setSettings } from "@koloda/srs-pgsql";
import { produce } from "immer";

export async function getAIProfiles(db: DB): Promise<AIProfile[]> {
  const aiSettings = await getSettings<"ai">(db, "ai");
  return aiSettings?.content?.profiles ?? [];
}

export async function addAIProfile(db: DB, data: AddAIProfileData): Promise<void> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  const newProfile: AIProfile = {
    id,
    title: data.title,
    secrets: data.secrets,
    lastUsedModel: undefined,
    createdAt: now,
    lastUsedAt: null,
  };

  const currentSettings = await getSettings<"ai">(db, "ai");
  const currentContent = currentSettings?.content ?? { profiles: [] };

  const newContent = aiSettingsValidation.parse(
    produce(currentContent, (draft) => {
      draft.profiles.push(newProfile);
    }),
  );

  await setSettings<"ai">(db, { name: "ai", content: newContent });
}

export async function updateAIProfile(db: DB, data: UpdateAIProfileData): Promise<void> {
  const currentSettings = await getSettings<"ai">(db, "ai");
  if (!currentSettings) return;

  const newContent = aiSettingsValidation.parse(
    produce(currentSettings.content, (draft) => {
      const profile = draft.profiles.find((p) => p.id === data.id);
      if (profile) {
        if (data.title !== undefined) profile.title = data.title;
        if (data.secrets !== undefined) profile.secrets = data.secrets;
      }
    }),
  );

  await setSettings<"ai">(db, { name: "ai", content: newContent });
}

export async function removeAIProfile(db: DB, data: RemoveAIProfileData): Promise<void> {
  const currentSettings = await getSettings<"ai">(db, "ai");
  if (!currentSettings) return;

  const newContent = aiSettingsValidation.parse(
    produce(currentSettings.content, (draft) => {
      draft.profiles = draft.profiles.filter((p) => p.id !== data.id);
    }),
  );

  await setSettings<"ai">(db, { name: "ai", content: newContent });
}

export async function touchAIProfile(db: DB, data: TouchAIProfileData): Promise<void> {
  const currentSettings = await getSettings<"ai">(db, "ai");
  if (!currentSettings) return;

  const newContent = aiSettingsValidation.parse(
    produce(currentSettings.content, (draft) => {
      const profile = draft.profiles.find((p) => p.id === data.id);
      if (profile) {
        profile.lastUsedAt = new Date().toISOString();
        if (data.modelId) profile.lastUsedModel = data.modelId;
      }
    }),
  );

  await setSettings<"ai">(db, { name: "ai", content: newContent });
}

export async function getAIProfileModels(db: DB, profileId: string) {
  try {
    const aiSettings = await getSettings<"ai">(db, "ai");
    const profile = aiSettings?.content?.profiles.find((item) => item.id === profileId) ?? null;

    return profile ? await fetchModels(profile.secrets) : [];
  } catch {
    return [];
  }
}
