import { Add01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { QueryState } from "@koloda/react";
import { queriesAtom, queryKeys } from "@koloda/react-base";
import type { Deck, InsertCardData, Template, ZodIssue } from "@koloda/srs";
import { getInsertCardSchema, insertCardSchema as schema, toFormErrors } from "@koloda/srs";
import { Button, Dialog, Label, TextField, useAppForm } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { useEffect, useMemo, useRef, useState } from "react";
import { FocusScope } from "react-aria";

type AddCardProps = {
  deckId: Deck["id"];
  templateId: Template["id"];
};

export function AddCard({ deckId, templateId }: AddCardProps) {
  const queryClient = useQueryClient();
  const { _ } = useLingui();
  const { getTemplateQuery, addCardMutation } = useAtomValue(queriesAtom);
  const query = useQuery({ queryKey: queryKeys.templates.detail(templateId), ...getTemplateQuery(templateId) });
  const template = query.data;
  const { mutate, error, reset } = useMutation(addCardMutation());
  const content = useMemo(() => (
    template
      ? template.content.fields.reduce((acc, x) => ({ ...acc, [`${x.id}`]: { text: "" } }), {})
      : {}
  ), [template]);
  const firstFieldRef = useRef<HTMLTextAreaElement>(null);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (isOpen) {
      requestAnimationFrame(() => {
        firstFieldRef.current?.focus();
      });
    }
  }, [isOpen]);

  const form = useAppForm({
    defaultValues: { content, deckId, templateId } as InsertCardData,
    validators: { onSubmit: template ? getInsertCardSchema(template) : schema },
    onSubmit: async ({ formApi, value }) => {
      mutate(value, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: queryKeys.cards.deck({ deckId }) });
          formApi.reset();
          firstFieldRef.current?.focus();
        },
      });
    },
  });

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (!open) {
      form.reset();
      reset();
    }
  };

  return (
    <Dialog.Root isOpen={isOpen} onOpenChange={handleOpenChange}>
      <Button
        variants={{ style: "dashed", size: "icon" }}
        aria-label={_(msg`add-cards.trigger`)}
      >
        <HugeiconsIcon className="size-4 min-w-4" strokeWidth={3} icon={Add01Icon} aria-hidden="true" />
      </Button>
      <Dialog.Overlay>
        <Dialog.Modal variants={{ size: "large" }}>
          <Dialog.Body>
            <FocusScope>
              <Dialog.Header>
                <Dialog.Title>{_(msg`add-cards.title`)}</Dialog.Title>
                <div className="grow" />
                <Dialog.Close slot="close" />
              </Dialog.Header>
              <form
                className="grow flex flex-col"
                onSubmit={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  form.handleSubmit();
                }}
              >
                <Dialog.Content variants={{ class: "justify-center pb-6" }}>
                  <QueryState query={query}>
                    {(data) => {
                      return data.content.fields.map(({ id, title }, i) => (
                        <form.AppField name={`content.${id}.text`} key={id}>
                          {(field) => (
                            <field.TextField>
                              <Label>{title}</Label>
                              <TextField.Content>
                                <TextField.TextArea ref={i === 0 ? firstFieldRef : undefined} />
                                {!field.state.meta.isValid && (
                                  <TextField.Errors errors={field.state.meta.errors as ZodIssue[]} />
                                )}
                              </TextField.Content>
                            </field.TextField>
                          )}
                        </form.AppField>
                      ));
                    }}
                  </QueryState>
                </Dialog.Content>
                <Dialog.Footer>
                  {error && <form.Errors errors={toFormErrors(error)} />}
                  <div className="grow" />
                  <form.Subscribe selector={(state) => [state.isDirty, state.canSubmit]}>
                    {([isDirty, canSubmit]) => (
                      <Button
                        variants={{ style: "primary" }}
                        type="submit"
                        isDisabled={!canSubmit || !isDirty}
                      >
                        {_(msg`add-card.submit`)}
                      </Button>
                    )}
                  </form.Subscribe>
                </Dialog.Footer>
              </form>
            </FocusScope>
          </Dialog.Body>
        </Dialog.Modal>
      </Dialog.Overlay>
    </Dialog.Root>
  );
}
