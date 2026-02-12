import { cardsQueryKeys, queriesAtom, QueryState, templatesQueryKeys } from "@koloda/react";
import type { Deck, InsertCardData, Template, ZodIssue } from "@koloda/srs";
import { getInsertCardSchema, insertCardSchema as schema, toFormErrors } from "@koloda/srs";
import { Button, Dialog, Label, TextField, useAppForm } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { Plus } from "lucide-react";
import { useMemo, useRef, useState } from "react";

type AddCardProps = {
  deckId: Deck["id"];
  templateId: Template["id"];
};

export function AddCard({ deckId, templateId }: AddCardProps) {
  const queryClient = useQueryClient();
  const { _ } = useLingui();
  const { getTemplateQuery, addCardMutation } = useAtomValue(queriesAtom);
  const query = useQuery({ queryKey: templatesQueryKeys.detail(templateId), ...getTemplateQuery(templateId) });
  const template = query.data;
  const { mutate, error, reset } = useMutation(addCardMutation());
  const content = useMemo(() => (
    template
      ? template.content.fields.reduce((acc, x) => (
        { ...acc, [x.id.toString()]: { text: "" } }
      ), {})
      : {}
  ), [template]);
  const firstFieldRef = useRef<HTMLTextAreaElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const form = useAppForm({
    defaultValues: { content, deckId, templateId } as InsertCardData,
    validators: { onSubmit: template ? getInsertCardSchema(template) : schema },
    onSubmit: async ({ formApi, value }) => {
      mutate(value, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: cardsQueryKeys.deck({ deckId }) });
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
      <Button variants={{ style: "dashed", size: "default", class: "max-tb:hidden" }}>
        <Plus className="size-4" />
        <span className="max-tb:hidden">{_(msg`add-cards.trigger`)}</span>
      </Button>
      <Button
        variants={{ style: "dashed", size: "icon", class: "tb:hidden" }}
        aria-label={_(msg`add-cards.trigger`)}
      >
        <Plus className="size-4" />
      </Button>
      <Dialog.Overlay>
        <Dialog.Modal variants={{ size: "large" }}>
          <Dialog.Body>
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
                  {(data) => (
                    data.content.fields.map(({ id, title }, i) => (
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
                    ))
                  )}
                </QueryState>
              </Dialog.Content>
              <Dialog.Footer>
                {error && <form.Errors errors={toFormErrors(error)} />}
                <div className="grow" />
                <form.Subscribe selector={(state) => [state.isDirty, state.canSubmit]}>
                  {([isDirty, canSubmit]) => (
                    <Button
                      variants={{ style: "primary" }}
                      isDisabled={!canSubmit || !isDirty}
                      onClick={form.handleSubmit}
                    >
                      {_(msg`add-card.submit`)}
                    </Button>
                  )}
                </form.Subscribe>
              </Dialog.Footer>
            </form>
          </Dialog.Body>
        </Dialog.Modal>
      </Dialog.Overlay>
    </Dialog.Root>
  );
}
