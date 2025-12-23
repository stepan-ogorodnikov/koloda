import { queriesAtom, templatesQueryKeys } from "@koloda/react";
import { DEFAULT_TEMPLATE, insertTemplateSchema as schema, templatesMessages } from "@koloda/srs";
import type { InsertTemplateData, Template } from "@koloda/srs";
import { Button, Dialog, Label, Link, link, TextField, useAppForm } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useStore } from "@tanstack/react-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { PlusIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export function AddTemplate() {
  const queryClient = useQueryClient();
  const { _ } = useLingui();
  const { addTemplateMutation } = useAtomValue(queriesAtom);
  const { mutate, isSuccess } = useMutation(addTemplateMutation());
  const linkRef = useRef<HTMLAnchorElement>(null);
  const [newId, setNewId] = useState<Template["id"] | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const form = useAppForm({
    defaultValues: { ...DEFAULT_TEMPLATE, title: "" } as InsertTemplateData,
    validators: { onSubmit: schema },
    listeners: {
      onChange: () => {
        setNewId(null);
      },
    },
    onSubmit: async ({ value, formApi }) => {
      mutate(schema.parse({ ...value }), {
        onSuccess: (returning) => {
          formApi.reset();
          queueMicrotask(() => {
            if (returning) setNewId(returning.id);
          });
          queryClient.invalidateQueries({ queryKey: templatesQueryKeys.all() });
        },
      });
    },
  });

  const formErrorMap = useStore(form.store, (state) => state.errorMap);
  const isLinkVisible = !!(isSuccess && newId);

  useEffect(() => {
    if (newId) linkRef.current?.focus();
  }, [newId]);

  useEffect(() => {
    setNewId(null);
    form.reset();
  }, [isOpen, form]);

  return (
    <Dialog.Root isOpen={isOpen} onOpenChange={setIsOpen}>
      <Button variants={{ style: "dashed", size: "icon" }} aria-label={_(msg`add-template.trigger`)}>
        <PlusIcon className="size-4 stroke-2" />
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
              {formErrorMap.onSubmit && <form.Errors errors={formErrorMap.onSubmit} translations={templatesMessages} />}
            </Dialog.Content>
            <Dialog.Footer>
              {isLinkVisible && (
                <Link
                  className={link({ type: "added" })}
                  ref={linkRef}
                  to="/templates/$templateId"
                  params={{ templateId: newId }}
                  onClick={() => setIsOpen(false)}
                >
                  {_(msg`add-template.redirect.link`)}
                </Link>
              )}
              <div className="grow" />
              <form.Subscribe selector={(state) => [state.canSubmit]}>
                {([canSubmit]) => (
                  <Button
                    variants={{ style: "primary" }}
                    type="submit"
                    isDisabled={!canSubmit || isLinkVisible}
                  >
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
