import { ERROR_MESSAGES } from "@koloda/app";
import type { ErrorCode, FormError } from "@koloda/app";
import { useAppHotkey, useHotkeysSettings, useHotkeysStatus } from "@koloda/core-react";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { Trans } from "@lingui/react/macro";
import { createFormHook, createFormHookContexts } from "@tanstack/react-form";
import { AnimatePresence, LayoutGroup } from "motion/react";
import type { PropsWithChildren } from "react";
import { useEffect } from "react";
import { ErrorMessage } from "../../ui/error-message";
import { Fade } from "../animations/fade";
import { Button } from "./button";
import type { ButtonProps } from "./button";
import { FormTextField } from "./text-field";

function Timestamps(props: PropsWithChildren) {
  return <div className="flex flex-row flex-wrap items-center gap-4" {...props} />;
}

type FormTimestampProps = { timestamp?: Date | null };

function Timestamp({ children }: PropsWithChildren) {
  return <span className="fg-level-4">{children}</span>;
}

function CreatedAt({ timestamp }: FormTimestampProps) {
  const { i18n } = useLingui();

  if (!timestamp) return null;

  return (
    <Timestamp>
      <Trans>form.created-at {i18n.date(timestamp)}</Trans>
    </Timestamp>
  );
}

function UpdatedAt({ timestamp }: FormTimestampProps) {
  const { i18n } = useLingui();

  if (!timestamp) return null;

  return (
    <Timestamp>
      <Trans>form.updated-at {i18n.date(timestamp)}</Trans>
    </Timestamp>
  );
}

type FormErrorsProps = {
  errors: Record<number | string, FormError[]> | FormError[] | undefined;
};

export function Errors({ errors }: FormErrorsProps) {
  if (!errors) return null;

  const flattenedErrors = (Array.isArray(errors) ? errors : Object.values(errors).flat()) as FormError[];
  const uniqueErrors = Array.from(new Map(flattenedErrors.map((error) => [error.message, error])).values());

  return (
    <div className="flex flex-col gap-2" role="alert">
      {uniqueErrors.map((error) => (
        <ErrorsItem error={error} key={error.message} />
      ))}
    </div>
  );
}

type ErrorsItemProps = { error: FormError };

function ErrorsItem({ error }: ErrorsItemProps) {
  const { _ } = useLingui();
  const content = ERROR_MESSAGES[error.message as ErrorCode] ?? ERROR_MESSAGES.unknown;
  const message = typeof content === "function" ? _(content(error)) : _(content);

  return <ErrorMessage layout="inline" message={message} details={error.details} />;
}

function SubmitButton(props: ButtonProps) {
  const form = useFormContext();
  const { _ } = useLingui();

  return (
    <form.Subscribe selector={(state) => [state.canSubmit]}>
      {([canSubmit]) => (
        <Button variants={{ style: "primary", class: "w-full" }} type="submit" isDisabled={!canSubmit} {...props}>
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

function Controls() {
  const form = useFormContext();
  const {
    form: { submit, reset },
  } = useHotkeysSettings();
  const { disableScope, enableScope } = useHotkeysStatus();

  // WHY: Scoped activation instead of conflictBehavior replace — replace permanently
  // unregisters the conflicting handler, so a user-rebound key would kill e.g. a nav
  // binding until the settings query identity changes.
  useEffect(() => {
    enableScope("form");
    return () => disableScope("form");
  }, [disableScope, enableScope]);

  useAppHotkey(
    submit,
    () => {
      if (form.state.canSubmit) form.handleSubmit();
    },
    "form",
  );
  useAppHotkey(
    reset,
    () => {
      if (form.state.isDirty) form.reset();
    },
    "form",
  );

  return (
    <div className="sticky bottom-16 wd:bottom-2 flex flex-col items-center gap-2">
      <LayoutGroup>
        <form.Subscribe selector={(state) => [state.errorMap]}>
          {([{ onChange, onSubmit }]) => (
            <AnimatePresence>
              {(onChange || onSubmit) && (
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
                  <SubmitButton />
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
    SubmitButton,
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
