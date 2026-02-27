export const aiQueryKeys = {
  profiles: () => ["ai", "profiles"] as const,
  models: (credentialId: string) => ["ai", "models", credentialId] as const,
} as const;
