import type { AddAIProfileData, AIProfile, AISecrets, RemoveAIProfileData, UpdateAIProfileData } from "@koloda/ai";
import { aiSettingsValidation, fetchModels, findDuplicateProfileId, isPresentApiKey } from "@koloda/ai";
import { AppError } from "@koloda/app";
import type { DB } from "@koloda/srs-pgsql";
import { getSettings, setSettings } from "@koloda/srs-pgsql";
import { produce } from "immer";

function profileHasSecrets(secrets?: AISecrets): boolean {
  if (!secrets) return false;
  return isPresentApiKey(secrets.apiKey);
}

export async function getAIProfiles(db: DB): Promise<AIProfile[]> {
  const aiSettings = await getSettings<"ai">(db, "ai");
  const profiles = aiSettings?.content?.profiles ?? [];
  // WHY: Settings JSON may omit `hasSecrets` (zod default on parse). Fill from
  // present apiKey so the `AIProfile` output type is satisfied without redacting.
  return profiles.map((profile) => ({
    ...profile,
    hasSecrets: profile.hasSecrets ?? profileHasSecrets(profile.secrets),
  }));
}

export async function addAIProfile(db: DB, data: AddAIProfileData): Promise<void> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  const newProfile: AIProfile = {
    id,
    title: data.title,
    secrets: data.secrets,
    hasSecrets: profileHasSecrets(data.secrets),
    createdAt: now,
  };

  const currentSettings = await getSettings<"ai">(db, "ai");
  const currentContent = currentSettings?.content ?? { profiles: [] };

  const newContent = aiSettingsValidation.parse(
    produce(currentContent, (draft) => {
      draft.profiles.push(newProfile);
    }),
  );

  const duplicateId = findDuplicateProfileId(newContent);
  if (duplicateId) {
    throw new AppError("validation.ai-providers.profile-id.duplicate", duplicateId);
  }

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
        if (data.secrets !== undefined) {
          profile.secrets = data.secrets;
          profile.hasSecrets = profileHasSecrets(data.secrets);
        }
      }
    }),
  );

  const duplicateId = findDuplicateProfileId(newContent);
  if (duplicateId) {
    throw new AppError("validation.ai-providers.profile-id.duplicate", duplicateId);
  }

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

export async function getAIProfileModels(db: DB, profileId: string) {
  const aiSettings = await getSettings<"ai">(db, "ai");
  const profile = aiSettings?.content?.profiles.find((item) => item.id === profileId) ?? null;

  return profile ? await fetchModels(profile.secrets) : [];
}
