import type { AiProvider } from "@koloda/ai";
import { toFormErrors } from "@koloda/app";
import { Button, Dialog, useAppForm } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { AI_PROVIDER_FORM_CONFIG, getAddDefaultValues } from "./ai-provider-form-config";
import { AIProfileFormFields } from "./ai-profile-form-fields";
import type { AddAIProfileFormProps } from "./ai-profile-form-props";

export type AddAIProfileFormWithProviderProps = AddAIProfileFormProps & {
  provider: AiProvider;
};

export function AddAIProfileForm({ provider, onSubmit, isPending, error }: AddAIProfileFormWithProviderProps) {
  const { _ } = useLingui();
  const config = AI_PROVIDER_FORM_CONFIG[provider];

  const form = useAppForm({
    defaultValues: getAddDefaultValues(config),
    validators: { onSubmit: config.schema },
    onSubmit: async ({ value }) => {
      onSubmit({
        title: value.title || undefined,
        secrets: config.toSecrets(value),
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
        <AIProfileFormFields form={form} fields={config.fields} mode="add" />
        {error && <form.Errors errors={toFormErrors(error)} />}
      </Dialog.Content>
      <Dialog.Footer>
        <div className="grow" />
        <form.Subscribe selector={(state) => [state.canSubmit]}>
          {([canSubmit]) => (
            <Button variants={{ style: "primary" }} type="submit" isDisabled={!canSubmit || isPending}>
              {_(msg`settings.ai.add.submit`)}
            </Button>
          )}
        </form.Subscribe>
      </Dialog.Footer>
    </form>
  );
}
