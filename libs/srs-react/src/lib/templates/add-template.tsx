import { generateUuidv7, toFormErrors } from "@koloda/app";
import { queriesAtom, queryKeys } from "@koloda/core-react";
import { DEFAULT_TEMPLATE, insertTemplateSchema as schema, translateDefaultTemplateContent } from "@koloda/srs";
import type { InsertTemplateData, Template } from "@koloda/srs";
import {
  AddIcon,
  Button,
  Dialog,
  Label,
  Link,
  link,
  TextField,
  Tooltip,
  useAppForm,
  useMotionSetting,
} from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useStore } from "@tanstack/react-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { useEffect, useState } from "react";
import { useEntityCreatedLink } from "../components/use-entity-created-link";

export function AddTemplate() {
  const queryClient = useQueryClient();
  const { _ } = useLingui();
  const { addTemplateMutation } = useAtomValue(queriesAtom);
  const isMotionOn = useMotionSetting();
  const { mutateAsync, isSuccess } = useMutation(addTemplateMutation());
  const { linkRef, newId, clearNewId, handleCreated, isLinkVisible } = useEntityCreatedLink<Template["id"]>(isSuccess);
  const [isOpen, setIsOpen] = useState(false);
  const form = useAppForm({
    defaultValues: { ...DEFAULT_TEMPLATE, title: "" } as InsertTemplateData,
    validators: { onSubmit: schema },
    listeners: {
      onChange: () => {
        clearNewId();
      },
    },
    onSubmit: async ({ value, formApi }) => {
      // WHY: the default fields are built per add, in the current language and with their own ids.
      // `defaultValues` holds the seed ids, and the reset after a success restores them, so ids minted
      // there would repeat on the next add.
      const defaults = translateDefaultTemplateContent(_);
      const fieldIds = new Map(defaults.fields.map((field) => [field.id, generateUuidv7()]));
      const content = {
        fields: defaults.fields.map((field) => ({ ...field, id: fieldIds.get(field.id) ?? field.id })),
        layout: defaults.layout.map((item) => ({ ...item, field: fieldIds.get(item.field) ?? item.field })),
      };
      // WHY: await the add so the form stays submitting until it settles; canSubmit stays
      // false meanwhile, so a second press cannot add twice.
      let returning;
      try {
        returning = await mutateAsync(schema.parse({ ...value, content }));
      } catch (error) {
        formApi.setErrorMap({ onSubmit: toFormErrors(error) });
        return;
      }
      formApi.reset();
      handleCreated(returning);
      queryClient.invalidateQueries({ queryKey: queryKeys.templates.all() });
    },
  });

  const formErrorMap = useStore(form.store, (state) => state.errorMap);

  useEffect(() => {
    clearNewId();
    form.reset();
  }, [isOpen, form, clearNewId]);

  return (
    <Dialog.Root isOpen={isOpen} onOpenChange={setIsOpen}>
      <Tooltip content={_(msg`add-template.trigger`)}>
        <Button variants={{ style: "dashed", size: "icon" }} aria-label={_(msg`add-template.trigger`)}>
          <AddIcon className="size-4 min-w-4" strokeWidth={3} aria-hidden="true" />
        </Button>
      </Tooltip>
      <Dialog.Popover variants={{ class: "min-w-84" }}>
        <Dialog.Body>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              e.stopPropagation();
              form.handleSubmit();
            }}
          >
            <Dialog.Header>
              <Dialog.Title>{_(msg`add-template.title`)}</Dialog.Title>
            </Dialog.Header>
            <Dialog.Content variants={{ class: "min-h-34" }}>
              <form.Field name="title">
                {(field) => (
                  <TextField
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e)}
                    autoFocus
                  >
                    <Label>{_(msg`add-template.inputs.title.label`)}</Label>
                    <TextField.Input />
                  </TextField>
                )}
              </form.Field>
              <div className="min-h-10 mt-4">
                {formErrorMap.onSubmit && <form.Errors errors={formErrorMap.onSubmit} />}
              </div>
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
                  {_(msg`add-template.redirect.link`)}
                </Link>
              )}
              <div className="grow" />
              <form.Subscribe selector={(state) => [state.canSubmit]}>
                {([canSubmit]) => (
                  <Button variants={{ style: "primary" }} type="submit" isDisabled={!canSubmit || isLinkVisible}>
                    {_(msg`add-template.submit`)}
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
