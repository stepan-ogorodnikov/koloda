import type { ZodIssue } from "@koloda/srs";
import { Button, FormTextField } from "@koloda/ui";
import type { ButtonProps } from "@koloda/ui";
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { Trans } from "@lingui/react/macro";
import type { StandardSchemaV1Issue } from "@tanstack/react-form";
import { createFormHook, createFormHookContexts } from "@tanstack/react-form";
import type { PropsWithChildren } from "react";

function Timestamps(props: PropsWithChildren) {
  return <div className="flex flex-row flex-wrap items-center gap-4" {...props} />;
}

type FormTimestampProps = { timestamp?: Date | null };

function Timestamp({ children }: PropsWithChildren) {
  return (
    <span className="fg-level-4">
      {children}
    </span>
  );
}

function CreatedAt({ timestamp }: FormTimestampProps) {
  const { i18n } = useLingui();

  if (!timestamp) return null;

  return (
    <Timestamp>
      <Trans>form.createdAt {i18n.date(timestamp)}</Trans>
    </Timestamp>
  );
}

function UpdatedAt({ timestamp }: FormTimestampProps) {
  const { i18n } = useLingui();

  if (!timestamp) return null;

  return (
    <Timestamp>
      <Trans>form.updatedAt {i18n.date(timestamp)}</Trans>
    </Timestamp>
  );
}

function SubscribeButton(props: ButtonProps) {
  const form = useFormContext();
  const { _ } = useLingui();

  return (
    <form.Subscribe selector={(state) => [state.isDirty, state.canSubmit]}>
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

function Controls() {
  const form = useFormContext();
  return (
    <form.Subscribe selector={(state) => [state.isDirty]}>
      {([isDirty]) => (
        <div className="sticky bottom-16 tb:bottom-4 flex flex-col items-center">
          {isDirty && (
            <div className="flex flex-row gap-2 p-2 rounded-xl border-2 border-main bg-level-1">
              <SubscribeButton />
              <ResetButton />
            </div>
          )}
        </div>
      )}
    </form.Subscribe>
  );
}

type FormErrorsProps = {
  errors: Record<number | string, StandardSchemaV1Issue[]> | ZodIssue[] | undefined;
  translations?: Record<string, MessageDescriptor>;
  fallback?: MessageDescriptor;
};

export function Errors({ errors, translations, fallback }: FormErrorsProps) {
  const { _ } = useLingui();

  if (!errors) return null;

  const flattenedErrors = Object.values(errors).flat();
  const uniqueErrors = Array.from(new Map(flattenedErrors.map((error) => [error.message, error])).values());

  return (
    <div className="flex flex-col py-2" role="alert">
      {uniqueErrors.map(({ message }) => (
        <em className="fg-error not-italic" key={message}>
          {translations
            ? (translations[message] ? _(translations[message]) : (fallback ? _(fallback) : message))
            : message}
        </em>
      ))}
    </div>
  );
}

const { fieldContext, useFieldContext, formContext, useFormContext } = createFormHookContexts();

const { useAppForm, withForm } = createFormHook({
  fieldComponents: { TextField: FormTextField },
  formComponents: {
    Controls,
    SubscribeButton,
    ResetButton,
    Timestamp,
    Timestamps,
    CreatedAt,
    UpdatedAt,
    Errors,
  },
  fieldContext,
  formContext,
});

export { useAppForm, useFieldContext, useFormContext, withForm };
