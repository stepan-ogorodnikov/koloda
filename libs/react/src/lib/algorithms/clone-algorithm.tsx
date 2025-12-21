import { algorithmQueryKeys, queriesAtom } from "@koloda/react";
import { algorithmsMessages, cloneAlgorithmSchema as schema } from "@koloda/srs";
import type { Algorithm } from "@koloda/srs";
import { Button, Dialog, Label, Link, link, TextField, useAppForm } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useStore } from "@tanstack/react-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { Copy } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type CloneAlgorithmProps = { id: string };

export function CloneAlgorithm({ id }: CloneAlgorithmProps) {
  const queryClient = useQueryClient();
  const { _ } = useLingui();
  const { cloneAlgorithmMutation } = useAtomValue(queriesAtom);
  const { mutate, isSuccess } = useMutation(cloneAlgorithmMutation());
  const linkRef = useRef<HTMLAnchorElement>(null);
  const [newId, setNewId] = useState<Algorithm["id"] | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const form = useAppForm({
    defaultValues: { title: "", sourceId: id },
    validators: { onSubmit: schema },
    listeners: {
      onChange: () => {
        setNewId(null);
      },
    },
    onSubmit: async ({ value, formApi }) => {
      mutate(schema.parse(value), {
        onSuccess: (returning) => {
          formApi.reset();
          queueMicrotask(() => {
            if (returning) setNewId(returning.id);
          });
          queryClient.invalidateQueries({ queryKey: algorithmQueryKeys.all() });
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
      <Button variants={{ style: "primary" }}>
        <Copy className="size-4" />
        {_(msg`clone-algorithm.trigger`)}
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
                    <Label>{_(msg`clone-algorithm.inputs.title.label`)}</Label>
                    <TextField.Input />
                  </TextField>
                )}
              </form.Field>
              <div className="min-h-10">
                {formErrorMap.onSubmit && (
                  <form.Errors errors={formErrorMap.onSubmit} translations={algorithmsMessages} />
                )}
              </div>
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
                  {_(msg`clone-algorithm.redirect.link`)}
                </Link>
              )}
              <div className="grow" />
              <form.Subscribe selector={(state) => [state.canSubmit]}>
                {([canSubmit]) => (
                  <Button
                    variants={{ style: "primary" }}
                    type="submit"
                    isDisabled={!canSubmit || !!(isSuccess && newId)}
                  >
                    {isSuccess && newId
                      ? (
                        _(msg`clone-algorithm.success`)
                      )
                      : (
                        _(msg`clone-algorithm.submit`)
                      )}
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
