import { algorithmsMessages, DEFAULT_FSRS_ALGORITHM, insertAlgorithmSchema as schema } from "@koloda/srs";
import type { Algorithm } from "@koloda/srs";
import { Button, Dialog, Label, Link, link, TextField, useAppForm } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useStore } from "@tanstack/react-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { PlusIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { algorithmsQueryKeys, queriesAtom } from "@koloda/react";

export function AddAlgorithm() {
  const queryClient = useQueryClient();
  const { _ } = useLingui();
  const { addAlgorithmMutation } = useAtomValue(queriesAtom);
  const { mutate, isSuccess } = useMutation(addAlgorithmMutation());
  const linkRef = useRef<HTMLAnchorElement>(null);
  const [newId, setNewId] = useState<Algorithm["id"] | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const form = useAppForm({
    defaultValues: { title: "", content: DEFAULT_FSRS_ALGORITHM },
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
          queryClient.invalidateQueries({ queryKey: algorithmsQueryKeys.all() });
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
      <Button variants={{ style: "dashed", size: "icon" }} aria-label={_(msg`add-algorithm.trigger`)}>
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
              <Dialog.Title>{_(msg`add-algorithm.title`)}</Dialog.Title>
            </Dialog.Header>
            <Dialog.Content variants={{ class: "min-h-34" }}>
              <form.Field name="title">
                {(field) => (
                  <TextField
                    aria-label={_(msg`add-algorithm.inputs.title.label`)}
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e)}
                  >
                    <Label>{_(msg`add-algorithm.inputs.title.label`)}</Label>
                    <TextField.Input />
                  </TextField>
                )}
              </form.Field>
              {formErrorMap.onSubmit && (
                <form.Errors
                  errors={formErrorMap.onSubmit}
                  translations={algorithmsMessages}
                />
              )}
            </Dialog.Content>
            <Dialog.Footer>
              {isLinkVisible && (
                <Link
                  className={link({ type: "added" })}
                  ref={linkRef}
                  to="/algorithms/$algorithmId"
                  params={{ algorithmId: newId }}
                  onClick={() => setIsOpen(false)}
                >
                  {_(msg`add-algorithm.redirect.link`)}
                </Link>
              )}
              <div className="grow" />
              <form.Subscribe selector={(state) => [state.canSubmit]}>
                {([canSubmit]) => (
                  <Button
                    variants={{ style: "primary" }}
                    type="submit"
                    isDisabled={!canSubmit}
                  >
                    {_(msg`add-algorithm.submit`)}
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
