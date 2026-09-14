import { ChangeScreenModeIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { toFormErrors } from "@koloda/app";
import { queriesAtom, queryKeys } from "@koloda/core-react";
import { cloneTemplateSchema as schema } from "@koloda/srs";
import type { Template } from "@koloda/srs";
import { Button, Dialog, Label, Link, link, TextField, useAppForm, useMotionSetting } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useStore } from "@tanstack/react-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { useEffect, useState } from "react";
import { useEntityCreatedLink } from "../components/use-entity-created-link";

type CloneTemplateProps = { id: Template["id"] };

export function CloneTemplate({ id }: CloneTemplateProps) {
  const queryClient = useQueryClient();
  const { _ } = useLingui();
  const { cloneTemplateMutation } = useAtomValue(queriesAtom);
  const isMotionOn = useMotionSetting();
  const { mutate, isSuccess } = useMutation(cloneTemplateMutation());
  const { linkRef, newId, clearNewId, handleCreated, isLinkVisible } = useEntityCreatedLink<Template["id"]>(isSuccess);
  const [isOpen, setIsOpen] = useState(false);
  const form = useAppForm({
    defaultValues: { title: "", sourceId: id },
    validators: { onSubmit: schema },
    listeners: {
      onChange: () => {
        clearNewId();
      },
    },
    onSubmit: async ({ value, formApi }) => {
      mutate(schema.parse(value), {
        onSuccess: (returning) => {
          formApi.reset();
          handleCreated(returning);
          queryClient.invalidateQueries({ queryKey: queryKeys.templates.all() });
        },
        onError: (error) => {
          formApi.setErrorMap({ onSubmit: toFormErrors(error) });
        },
      });
    },
  });
  const formErrorMap = useStore(form.store, (state) => state.errorMap);

  useEffect(() => {
    clearNewId();
    form.reset();
  }, [isOpen, form, clearNewId]);

  return (
    <Dialog.Root isOpen={isOpen} onOpenChange={setIsOpen}>
      <Button variants={{ style: "primary" }}>
        <HugeiconsIcon className="size-5 min-w-5" strokeWidth={1.75} icon={ChangeScreenModeIcon} aria-hidden="true" />
        {_(msg`clone-template.trigger`)}
      </Button>
      <Dialog.Popover variants={{ class: "min-w-84" }}>
        <Dialog.Body>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              e.stopPropagation();
              form.handleSubmit();
            }}
          >
            <Dialog.Content>
              <form.Field name="title">
                {(field) => (
                  <TextField
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={field.handleChange}
                    autoFocus
                  >
                    <Label>{_(msg`clone-template.inputs.title.label`)}</Label>
                    <TextField.Input />
                  </TextField>
                )}
              </form.Field>
              <div className="min-h-10">{formErrorMap.onSubmit && <form.Errors errors={formErrorMap.onSubmit} />}</div>
            </Dialog.Content>
            <Dialog.Footer>
              {isLinkVisible && (
                <Link
                  className={link({ type: "added" })}
                  ref={linkRef}
                  to="/templates/$templateId"
                  params={{ templateId: newId }}
                  onClick={() => setIsOpen(false)}
                  viewTransition={isMotionOn}
                >
                  {_(msg`clone-template.redirect.link`)}
                </Link>
              )}
              <div className="grow" />
              <form.Subscribe selector={(state) => [state.canSubmit]}>
                {([canSubmit]) => (
                  <Button variants={{ style: "primary" }} type="submit" isDisabled={!canSubmit || isLinkVisible}>
                    {isLinkVisible ? _(msg`clone-template.success`) : _(msg`clone-template.submit`)}
                  </Button>
                )}
              </form.Subscribe>
            </Dialog.Footer>
          </form>
        </Dialog.Body>
      </Dialog.Popover>
    </Dialog.Root>
  );
}
