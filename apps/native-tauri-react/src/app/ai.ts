import type { AIProfile } from "@koloda/srs";
import { fetchModels } from "@koloda/srs";
import { invoke } from "./tauri";

export async function getAIProfileModels(profileId: string) {
  try {
    const profiles = await invoke<AIProfile[]>("cmd_get_ai_profiles");
    const profile = profiles.find((p) => p.id === profileId);

    return profile?.secrets ? await fetchModels(profile.secrets) : [];
  } catch {
    return [];
  }
}
