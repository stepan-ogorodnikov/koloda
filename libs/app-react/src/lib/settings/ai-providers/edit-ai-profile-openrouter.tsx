import { aiProfileValidation, openRouterSecretsValidation } from "@koloda/ai";
import type { ZodIssue } from "@koloda/app";
import { toFormErrors } from "@koloda/app";
import type { EditAIProfileFormProps } from "@koloda/srs";
import { Button, Dialog, Label, TextField, useAppForm } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import type { z } from "zod";
import { AIProfileSecretsField } from "./ai-profile-secrets-field";

const formSchema = openRouterSecretsValidation.extend({
  title: aiProfileValidation.shape.title,
});

type FormValues = z.infer<typeof formSchema>;

export function EditAIProfileOpenRouter({ profile, onSubmit, isPending, error }: EditAIProfileFormProps) {
  const { _ } = useLingui();
  const apiKey = profile.secrets?.provider === "openrouter" ? profile.secrets.apiKey : "";

  const form = useAppForm({
    defaultValues: { title: profile.title, apiKey } as FormValues,
    validators: { onSubmit: formSchema },
    onSubmit: async ({ value }) => {
      onSubmit({
        title: value.title,
        secrets: { provider: "openrouter", apiKey: value.apiKey },
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
        <form.Field name="title">
          {(field) => (
            <TextField
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={field.handleChange}
            >
              <Label>{_(msg`settings.ai.profiles.title.label`)}</Label>
              <TextField.Input placeholder={_(msg`settings.ai.profiles.title.placeholder`)} />
              {!field.state.meta.isValid && <TextField.Errors errors={field.state.meta.errors as ZodIssue[]} />}
            </TextField>
          )}
        </form.Field>
        <form.Field name="apiKey">
          {(field) => (
            <AIProfileSecretsField
              label={_(msg`settings.ai.profiles.api-key.label`)}
              value={field.state.value}
              onChange={field.handleChange}
              errors={!field.state.meta.isValid ? field.state.meta.errors as ZodIssue[] : undefined}
            />
          )}
        </form.Field>
        {error && <form.Errors errors={toFormErrors(error)} />}
      </Dialog.Content>
      <Dialog.Footer>
        <div className="grow" />
        <form.Subscribe selector={(state) => [state.canSubmit]}>
          {([canSubmit]) => (
            <Button
              variants={{ style: "primary" }}
              type="submit"
              isDisabled={!canSubmit || isPending}
            >
              {_(msg`settings.ai.edit.submit`)}
            </Button>
          )}
        </form.Subscribe>
      </Dialog.Footer>
    </form>
  );
}
