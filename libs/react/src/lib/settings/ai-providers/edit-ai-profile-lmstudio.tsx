import type { EditAIProfileFormProps, ZodIssue } from "@koloda/srs";
import { aiProfileValidation, lmstudioSecretsValidation } from "@koloda/srs";
import { Button, Dialog, Label, TextField, useAppForm } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import type { z } from "zod";
import { AIProfileSecretsField } from "./ai-profile-secrets-field";

const formSchema = lmstudioSecretsValidation.extend({
  title: aiProfileValidation.shape.title,
});

type FormValues = z.infer<typeof formSchema>;

export function EditAIProfileLMStudio({ profile, onSubmit, isPending }: EditAIProfileFormProps) {
  const { _ } = useLingui();
  const secrets = profile.secrets?.provider === "lmstudio" ? profile.secrets : undefined;

  const form = useAppForm({
    defaultValues: {
      title: profile.title,
      baseUrl: secrets?.baseUrl,
      apiKey: secrets?.apiKey,
    } as FormValues,
    validators: { onSubmit: formSchema },
    onSubmit: async ({ value }) => {
      const secrets = {
        provider: "lmstudio" as const,
        baseUrl: value.baseUrl,
        apiKey: value.apiKey,
      };
      onSubmit({
        title: value.title,
        secrets,
      });
    },
  });

  return (
    <>
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
        <form.Field name="baseUrl">
          {(field) => (
            <TextField
              type="url"
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={field.handleChange}
              isRequired
            >
              <Label>{_(msg`settings.ai.profiles.base-url.label`)}</Label>
              <TextField.Input placeholder="http://localhost:1234/v1" />
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
      </Dialog.Content>
      <Dialog.Footer>
        <div className="grow" />
        <form.Subscribe selector={(state) => [state.canSubmit]}>
          {([canSubmit]) => (
            <Button
              variants={{ style: "primary" }}
              onClick={form.handleSubmit}
              isDisabled={!canSubmit || isPending}
            >
              {_(msg`settings.ai.edit.submit`)}
            </Button>
          )}
        </form.Subscribe>
      </Dialog.Footer>
    </>
  );
}
