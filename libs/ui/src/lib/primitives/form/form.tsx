import { Button, FormTextField } from "@koloda/ui";
import type { ButtonProps } from "@koloda/ui";
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { Trans } from "@lingui/react/macro";
import type { StandardSchemaV1Issue } from "@tanstack/react-form";
import { createFormHook, createFormHookContexts } from "@tanstack/react-form";
import type { PropsWithChildren } from "react";

function FormTimestamps(props: PropsWithChildren) {
  return <div className="flex flex-row items-center gap-4" {...props} />;
}

type FormTimestampProps = { timestamp?: Date | null };

function FormTimestamp({ children }: PropsWithChildren) {
  return (
    <span className="fg-level-4">
      {children}
    </span>
  );
}

function FormCreatedAt({ timestamp }: FormTimestampProps) {
  const { i18n } = useLingui();

  if (!timestamp) return null;

  return (
    <FormTimestamp>
      <Trans>form.createdAt {i18n.date(timestamp)}</Trans>
    </FormTimestamp>
  );
}

function FormUpdatedAt({ timestamp }: FormTimestampProps) {
  const { i18n } = useLingui();

  if (!timestamp) return null;

  return (
    <FormTimestamp>
      <Trans>form.updatedAt {i18n.date(timestamp)}</Trans>
    </FormTimestamp>
  );
}

function SubscribeButton(props: ButtonProps) {
  const form = useFormContext();
  const { _ } = useLingui();

  return (
    <form.Subscribe
      selector={(state) => [state.isDirty, state.canSubmit]}
    >
      {([isDirty, canSubmit]) => (
        <Button
          variants={{
            style: "primary",
            class: "w-full disabled:invisible",
          }}
          type="submit"
          isDisabled={!canSubmit || !isDirty}
          {...props}
        >
          {_(msg`form.save`)}
        </Button>
      )}
    </form.Subscribe>
  );
}

function ResetButton(props: ButtonProps) {
  const form = useFormContext();
  const { _ } = useLingui();

  return (
    <form.Subscribe selector={(state) => [state.isDirty]}>
      {([isDirty]) => (
        <Button
          variants={{
            style: "primary",
            class: "w-full disabled:invisible",
          }}
          type="reset"
          isDisabled={!isDirty}
          onClick={(e) => {
            e.preventDefault();
            form.reset();
          }}
          {...props}
        >
          {_(msg`form.reset`)}
        </Button>
      )}
    </form.Subscribe>
  );
}

function FormControls() {
  return (
    <div className="flex flex-row items-center gap-2">
      <SubscribeButton />
      <ResetButton />
    </div>
  );
}

type FormErrorsProps = {
  errors: Record<string, StandardSchemaV1Issue[]>;
  translations?: Record<string, MessageDescriptor>;
  fallback?: MessageDescriptor;
};

function FormErrors({ errors, translations, fallback }: FormErrorsProps) {
  const { _ } = useLingui();
  const errorsArray = Object.values(errors).flat();

  return (
    <div className="flex flex-col py-2" role="alert">
      {errorsArray.map((error, i) => (
        <em className="fg-error not-italic" key={i}>
          {translations
            ? (translations[error.message] ? _(translations[error.message]) : (fallback ? _(fallback) : error.message))
            : error.message}
        </em>
      ))}
    </div>
  );
}

const { fieldContext, useFieldContext, formContext, useFormContext } = createFormHookContexts();

const { useAppForm, withForm } = createFormHook({
  fieldComponents: { TextField: FormTextField },
  formComponents: {
    FormControls,
    SubscribeButton,
    ResetButton,
    FormTimestamps,
    FormCreatedAt,
    FormUpdatedAt,
    Errors: FormErrors,
  },
  fieldContext,
  formContext,
});

export { useAppForm, useFieldContext, useFormContext, withForm };
