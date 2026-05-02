import type { AIProfile } from "@koloda/ai";
import { fetchModels } from "@koloda/ai";
import { invoke } from "../app/tauri";

export async function getAIProfileModels(profileId: string) {
  const profiles = await invoke<AIProfile[]>("cmd_get_ai_profiles");
  const profile = profiles.find((p) => p.id === profileId);
  if (!profile?.secrets) return [];
  return fetchModels(profile.secrets);
}
