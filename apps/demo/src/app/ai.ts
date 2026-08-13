import type { AddAIProfileData, AIProfile, AISecrets, RemoveAIProfileData, UpdateAIProfileData } from "@koloda/ai";
import { aiSettingsValidation, findDuplicateProfileId, isPresentApiKey } from "@koloda/ai";
import { AppError } from "@koloda/app";
import type { DB } from "@koloda/srs-pgsql";
import { getSettings, setSettings } from "@koloda/srs-pgsql";
import { produce } from "immer";

function profileHasSecrets(secrets?: AISecrets): boolean {
  if (!secrets) return false;
  return isPresentApiKey(secrets.apiKey);
}

function redactSecrets(secrets: AISecrets): AISecrets {
  switch (secrets.provider) {
    case "openrouter":
      return { provider: "openrouter", apiKey: null };
    case "opencodeGo":
      return { provider: "opencodeGo", apiKey: null };
    case "opencodeZen":
      return { provider: "opencodeZen", apiKey: null };
    case "ollamaCloud":
      return { provider: "ollamaCloud", apiKey: null };
    case "ollama":
      return { provider: "ollama", baseUrl: secrets.baseUrl, apiKey: null };
    case "lmstudio":
      return { provider: "lmstudio", baseUrl: secrets.baseUrl, apiKey: null };
  }
}

function toPublicProfile(profile: {
  id: string;
  title?: string;
  secrets?: AISecrets;
  hasSecrets?: boolean;
  createdAt: string;
}): AIProfile {
  // WHY: `hasSecrets` from stored key presence — not from a redacted `apiKey: null`.
  const hasSecrets = profile.hasSecrets === true || profileHasSecrets(profile.secrets);
  return {
    ...profile,
    secrets: profile.secrets ? redactSecrets(profile.secrets) : undefined,
    hasSecrets,
  };
}

// INVARIANT: Host-local only. Loads usable secrets from PGlite for demo AIRuntime.
// Never call from React Query / shared UI.
export async function loadAIProfileSecrets(db: DB, profileId: string): Promise<AISecrets | null> {
  const aiSettings = await getSettings<"ai">(db, "ai");
  return aiSettings?.content?.profiles.find((item) => item.id === profileId)?.secrets ?? null;
}

export async function getAIProfiles(db: DB): Promise<AIProfile[]> {
  const aiSettings = await getSettings<"ai">(db, "ai");
  const profiles = aiSettings?.content?.profiles ?? [];
  return profiles.map(toPublicProfile);
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
          const previous = profile.secrets;
          const providerChanged = previous?.provider !== data.secrets.provider;
          // WHY: Edit submits may omit apiKey when the user did not replace it.
          // Keep the stored key unless the provider changed or a new key was sent.
          if (!profileHasSecrets(data.secrets) && !providerChanged && profileHasSecrets(previous)) {
            profile.secrets = { ...data.secrets, apiKey: previous!.apiKey } as AISecrets;
          } else {
            profile.secrets = data.secrets;
          }
          profile.hasSecrets = profileHasSecrets(profile.secrets);
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
