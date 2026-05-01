import { aiProfileValidation } from "@koloda/ai";
import type { EditAIProfileFormProps, ZodIssue } from "@koloda/srs";
import { toFormErrors } from "@koloda/srs";
import { Button, Dialog, Label, TextField, useAppForm } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { z } from "zod";

const formSchema = z.object({
  title: aiProfileValidation.shape.title,
});

type FormValues = z.infer<typeof formSchema>;

export function EditAIProfileCodex({ profile, onSubmit, isPending, error }: EditAIProfileFormProps) {
  const { _ } = useLingui();

  const form = useAppForm({
    defaultValues: { title: profile.title } as FormValues,
    validators: { onSubmit: formSchema },
    onSubmit: async ({ value }) => {
      onSubmit({
        title: value.title,
        secrets: { provider: "codex" },
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
