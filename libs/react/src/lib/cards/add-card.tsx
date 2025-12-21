import { cardQueryKeys, queriesAtom, templateQueryKeys } from "@koloda/react";
import type { Deck, InsertCardData, Template, ZodIssue } from "@koloda/srs";
import { cardContentMessages, getInsertCardSchema, insertCardSchema as schema } from "@koloda/srs";
import { Button, Dialog, Label, TextField, useAppForm } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { Plus } from "lucide-react";
import { useMemo, useRef } from "react";

type AddCardProps = {
  deckId: Deck["id"];
  templateId: Template["id"];
};

export function AddCard({ deckId, templateId }: AddCardProps) {
  const queryClient = useQueryClient();
  const { _ } = useLingui();
  const { getTemplateQuery, addCardMutation } = useAtomValue(queriesAtom);
  const { data: template } = useQuery({
    queryKey: templateQueryKeys.detail(templateId),
    ...getTemplateQuery(templateId),
  });
  const { mutate } = useMutation(addCardMutation());
  const content = useMemo(() => (
    template
      ? template.content.fields.reduce((acc, x) => (
        { ...acc, [x.id.toString()]: { text: "" } }
      ), {})
      : {}
  ), [template]);
  const firstFieldRef = useRef<HTMLTextAreaElement>(null);
  const form = useAppForm({
    defaultValues: { content, deckId, templateId } as InsertCardData,
    validators: { onSubmit: template ? getInsertCardSchema(template) : schema },
    onSubmit: async ({ formApi, value }) => {
      mutate(value, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: cardQueryKeys.all({ deckId }) });
          formApi.reset();
          firstFieldRef.current?.focus();
        },
      });
    },
  });

  if (!template) return null;

  return (
    <Dialog.Root>
      <Button variants={{ style: "dashed", size: "icon" }}>
        <Plus className="size-4" />
        <span className="max-tb:hidden">{_(msg`add-cards.trigger`)}</span>
      </Button>
      <Dialog.Overlay>
        <Dialog.Modal variants={{ class: "min-w-84" }}>
          <Dialog.Body>
            <Dialog.Header>
              <Dialog.Title>{_(msg`add-cards.title`)}</Dialog.Title>
              <div className="grow" />
              <Dialog.Close slot="close" />
            </Dialog.Header>
            <Dialog.Content variants={{ class: "pb-6" }}>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  form.handleSubmit();
                }}
              >
                {template.content.fields.map(({ id, title }, i) => (
                  <form.AppField name={`content.${id}.text`} key={id}>
                    {(field) => (
                      <field.TextField>
                        <Label>{title}</Label>
                        <TextField.Content>
                          <TextField.TextArea ref={i === 0 ? firstFieldRef : undefined} />
                          {!field.state.meta.isValid && (
                            <TextField.Errors
                              errors={field.state.meta.errors as ZodIssue[]}
                              translations={cardContentMessages}
                            />
                          )}
                        </TextField.Content>
                      </field.TextField>
                    )}
                  </form.AppField>
                ))}
                <button className="hidden" type="submit" />
              </form>
            </Dialog.Content>
            <Dialog.Footer>
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
          </Dialog.Body>
        </Dialog.Modal>
      </Dialog.Overlay>
    </Dialog.Root>
  );
}
