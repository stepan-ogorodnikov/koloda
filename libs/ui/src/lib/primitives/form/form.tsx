import { ERROR_MESSAGES } from "@koloda/srs";
import type { ErrorCode, ZodIssue } from "@koloda/srs";
import { Button, Fade, FormTextField } from "@koloda/ui";
import type { ButtonProps } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { Trans } from "@lingui/react/macro";
import type { StandardSchemaV1Issue } from "@tanstack/react-form";
import { createFormHook, createFormHookContexts } from "@tanstack/react-form";
import { AnimatePresence, LayoutGroup } from "motion/react";
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

type FormErrorsProps = {
  errors: Record<number | string, StandardSchemaV1Issue[]> | ZodIssue[] | undefined;
};

export function Errors({ errors }: FormErrorsProps) {
  const { _ } = useLingui();

  if (!errors) return null;

  const flattenedErrors = Object.values(errors).flat();
  const uniqueErrors = Array.from(new Map(flattenedErrors.map((error) => [error.message, error])).values());

  return (
    <div className="flex flex-col gap-2" role="alert">
      {uniqueErrors.map(({ message }) => (
        <em className="fg-error not-italic" key={message}>
          {ERROR_MESSAGES[message as ErrorCode] ? _(ERROR_MESSAGES[message as ErrorCode]) : message}
        </em>
      ))}
    </div>
  );
}

function SubscribeButton(props: ButtonProps) {
  const form = useFormContext();
  const { _ } = useLingui();

  return (
    <form.Subscribe selector={(state) => [state.canSubmit]}>
      {([canSubmit]) => (
        <Button
          variants={{ style: "primary", class: "w-full" }}
          type="submit"
          isDisabled={!canSubmit}
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
    <Button
      variants={{ style: "primary", class: "w-full disabled:invisible" }}
      type="reset"
      onClick={(e) => {
        e.preventDefault();
        form.reset();
      }}
      {...props}
    >
      {_(msg`form.reset`)}
    </Button>
  );
}

type ControlsProps = Omit<FormErrorsProps, "errors"> & {
  showErrors?: boolean;
};

function Controls({ showErrors = true }: ControlsProps) {
  const form = useFormContext();

  return (
    <div className="sticky bottom-16 tb:bottom-2 flex flex-col items-center gap-2">
      <LayoutGroup>
        <form.Subscribe selector={(state) => [state.errorMap]}>
          {([{ onChange, onSubmit }]) => (
            <AnimatePresence>
              {showErrors && (onChange || onSubmit) && (
                <Fade className="max-w-132 py-2 px-4 rounded-xl border-2 border-main bg-level-1" layout>
                  {onChange && !onSubmit && <Errors errors={onChange} />}
                  {onSubmit && <Errors errors={onSubmit} />}
                </Fade>
              )}
            </AnimatePresence>
          )}
        </form.Subscribe>
        <form.Subscribe selector={(state) => [state.isDirty]}>
          {([isDirty]) => (
            <AnimatePresence>
              {isDirty && (
                <Fade className="flex flex-row gap-2 p-2 rounded-xl border-2 border-main bg-level-1" layout>
                  <SubscribeButton />
                  <ResetButton />
                </Fade>
              )}
            </AnimatePresence>
          )}
        </form.Subscribe>
      </LayoutGroup>
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
