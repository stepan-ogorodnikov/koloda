export type UseAIChatValidationOptions = {
  profileId: string;
  modelId: string;
  prompt: string;
  isLoading: boolean;
  hasRequiredSecrets: boolean;
  isModelsLoading: boolean;
  isModelsError: boolean;
};

export type UseAIChatValidationReturn = {
  canSubmit: boolean;
  canCancel: boolean;
  showMissingSecretsWarning: boolean;
};

export function useAIChatValidation({
  profileId,
  modelId,
  prompt,
  isLoading,
  hasRequiredSecrets,
  isModelsLoading,
  isModelsError,
}: UseAIChatValidationOptions): UseAIChatValidationReturn {
  const canSubmit = !!(
    profileId &&
    modelId &&
    !!prompt &&
    !isLoading &&
    hasRequiredSecrets &&
    !isModelsLoading &&
    // WHY: The model picker already surfaces model-list fetch errors (error row + retry).
    // No chat-level banner; submit just stays disabled until the list loads.
    !isModelsError
  );
  const canCancel = isLoading;
  const showMissingSecretsWarning = !!profileId && !hasRequiredSecrets;

  return { canSubmit, canCancel, showMissingSecretsWarning };
}
