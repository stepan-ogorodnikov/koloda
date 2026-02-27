import type { AddAIProfileData, AIProfile, RemoveAIProfileData, TouchAIProfileData } from "@koloda/srs";
import { aiSettingsValidation, fetchModels } from "@koloda/srs";
import type { DB } from "@koloda/srs-pgsql";
import { getSettings, setSettings } from "@koloda/srs-pgsql";

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
  const newContent = aiSettingsValidation.parse({
    ...currentContent,
    profiles: [...currentContent.profiles, newProfile],
  });

  await setSettings<"ai">(db, { name: "ai", content: newContent });
}

export async function removeAIProfile(db: DB, data: RemoveAIProfileData): Promise<void> {
  const currentSettings = await getSettings<"ai">(db, "ai");
  if (!currentSettings) return;

  const newContent = aiSettingsValidation.parse({
    ...currentSettings.content,
    profiles: currentSettings.content.profiles.filter((p) => p.id !== data.id),
  });

  await setSettings<"ai">(db, { name: "ai", content: newContent });
}

export async function touchAIProfile(db: DB, data: TouchAIProfileData): Promise<void> {
  const currentSettings = await getSettings<"ai">(db, "ai");
  if (!currentSettings) return;

  const now = new Date().toISOString();
  const newContent = aiSettingsValidation.parse({
    ...currentSettings.content,
    profiles: currentSettings.content.profiles.map((p) =>
      p.id === data.id
        ? { ...p, lastUsedAt: now, ...(!!data.modelId && { lastUsedModel: data.modelId }) }
        : p
    ),
  });

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
