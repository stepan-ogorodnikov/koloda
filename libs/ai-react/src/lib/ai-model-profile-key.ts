const SEPARATOR = "::";

export function encodeAIModelProfileKey(profileId: string, modelId: string): string {
  return `${profileId}${SEPARATOR}${modelId}`;
}

export function decodeAIModelProfileKey(key: string): { profileId: string; modelId: string } | null {
  const index = key.indexOf(SEPARATOR);
  if (index <= 0) return null;
  const profileId = key.slice(0, index);
  const modelId = key.slice(index + SEPARATOR.length);
  if (!profileId || !modelId) return null;

  return { profileId, modelId };
}
