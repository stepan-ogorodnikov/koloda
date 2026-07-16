import type { ZodIssue } from "@koloda/app";
import { Label, TextField } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import type { ReactNode } from "react";
import type { AIProfileFieldType, AIProfileProviderField } from "./ai-provider-form-config";
import { AIProfileSecretsField } from "./ai-profile-secrets-field";

type FieldApi = {
  state: {
    value: string | undefined;
    meta: { isValid: boolean; errors: unknown };
  };
  handleBlur: () => void;
  handleChange: (value: string) => void;
};

export type AIProfileFormFieldsProps = {
  form: {
    Field: (props: { name: AIProfileFieldType; children: (field: FieldApi) => ReactNode }) => ReactNode;
  };
  fields: AIProfileProviderField[];
  mode: "add" | "edit";
};

export function AIProfileFormFields({ form, fields, mode }: AIProfileFormFieldsProps) {
  const { _ } = useLingui();

  return fields.map((fieldConfig) => {
    const placeholder =
      fieldConfig.type === "title"
        ? _(msg`settings.ai.profiles.title.placeholder`)
        : fieldConfig.type === "baseUrl"
          ? fieldConfig.defaultValue
          : undefined;

    const label =
      fieldConfig.type === "title"
        ? _(msg`settings.ai.profiles.title.label`)
        : fieldConfig.type === "baseUrl"
          ? _(msg`settings.ai.profiles.base-url.label`)
          : _(msg`settings.ai.profiles.api-key.label`);

    return (
      <form.Field key={fieldConfig.type} name={fieldConfig.type}>
        {(field) => {
          if (fieldConfig.type === "apiKey" && mode === "edit") {
            return (
              <AIProfileSecretsField
                label={label}
                value={field.state.value}
                onChange={field.handleChange}
                errors={!field.state.meta.isValid ? (field.state.meta.errors as ZodIssue[]) : undefined}
              />
            );
          }

          return (
            <TextField
              type={fieldConfig.type === "baseUrl" ? "url" : fieldConfig.type === "apiKey" ? "password" : undefined}
              value={field.state.value ?? ""}
              onBlur={field.handleBlur}
              onChange={field.handleChange}
              isRequired={fieldConfig.isRequired}
            >
              <Label>{label}</Label>
              <TextField.Input placeholder={placeholder} />
              {!field.state.meta.isValid && <TextField.Errors errors={field.state.meta.errors as ZodIssue[]} />}
            </TextField>
          );
        }}
      </form.Field>
    );
  });
}
