import type { AddAIProfileFormProps, ZodIssue } from "@koloda/srs";
import { aiProfileValidation, ollamaSecretsValidation } from "@koloda/srs";
import { Button, Dialog, Label, TextField, useAppForm } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import type { z } from "zod";

const formSchema = ollamaSecretsValidation.extend({
  title: aiProfileValidation.shape.title,
});

type FormValues = z.infer<typeof formSchema>;

const defaultValues: FormValues = {
  title: "",
  baseUrl: "",
};

export function AddAIProfileOllama({ onSubmit, isPending }: AddAIProfileFormProps) {
  const { _ } = useLingui();

  const form = useAppForm({
    defaultValues,
    validators: { onSubmit: formSchema },
    onSubmit: async ({ value }) => {
      onSubmit({
        title: value.title || undefined,
        secrets: { provider: "ollama", baseUrl: value.baseUrl },
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
              <TextField.Input placeholder="http://localhost:11434" />
              {!field.state.meta.isValid && <TextField.Errors errors={field.state.meta.errors as ZodIssue[]} />}
            </TextField>
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
              {_(msg`settings.ai.add.submit`)}
            </Button>
          )}
        </form.Subscribe>
      </Dialog.Footer>
    </>
  );
}
