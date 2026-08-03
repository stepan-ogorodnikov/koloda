import type { AiProvider } from "@koloda/ai";
import { toFormErrors } from "@koloda/app";
import { Button, Dialog, useAppForm } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { AI_PROVIDER_FORM_CONFIG, getEditDefaultValues, getEditSchema } from "./ai-provider-form-config";
import { AIProfileFormFields } from "./ai-profile-form-fields";
import type { EditAIProfileFormProps } from "./ai-profile-form-props";

export type EditAIProfileFormWithProviderProps = EditAIProfileFormProps & {
  provider: AiProvider;
};

export function EditAIProfileForm({
  provider,
  profile,
  onSubmit,
  isPending,
  error,
}: EditAIProfileFormWithProviderProps) {
  const { _ } = useLingui();
  const config = AI_PROVIDER_FORM_CONFIG[provider];
  const hasSecrets = profile.hasSecrets ?? false;
  const hasBaseUrlField = config.fields.some((field) => field.type === "baseUrl");

  const form = useAppForm({
    defaultValues: getEditDefaultValues(config, profile),
    validators: { onSubmit: getEditSchema(config, hasSecrets) },
    onSubmit: async ({ value }) => {
      const hasNewApiKey = Boolean(value.apiKey?.trim());
      // WHY: Omit secrets on title-only edits so hosts keep the keyring/PGlite key.
      // Providers with baseUrl always send secrets; empty apiKey means keep existing.
      if (hasNewApiKey || hasBaseUrlField) {
        onSubmit({
          title: value.title || undefined,
          secrets: config.toSecrets(value),
        });
        return;
      }
      onSubmit({
        title: value.title || undefined,
      });
    },
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        e.stopPropagation();
        form.handleSubmit();
      }}
    >
      <Dialog.Content variants={{ class: "flex flex-col gap-4" }}>
        <AIProfileFormFields form={form} fields={config.fields} mode="edit" hasSecrets={hasSecrets} />
        {error && <form.Errors errors={toFormErrors(error)} />}
      </Dialog.Content>
      <Dialog.Footer>
        <div className="grow" />
        <form.Subscribe selector={(state) => [state.canSubmit]}>
          {([canSubmit]) => (
            <Button variants={{ style: "primary" }} type="submit" isDisabled={!canSubmit || isPending}>
              {_(msg`settings.ai.edit.submit`)}
            </Button>
          )}
        </form.Subscribe>
      </Dialog.Footer>
    </form>
  );
}
