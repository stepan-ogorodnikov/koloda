import { AlgorithmPicker, queriesAtom, TemplatePicker } from "@koloda/react";
import { decksMessages, insertDeckSchema as schema } from "@koloda/srs";
import type { Deck, InsertDeckData } from "@koloda/srs";
import { Button, Dialog, Label, Link, link, TextField, useAppForm } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useStore } from "@tanstack/react-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { PlusIcon } from "lucide-react";
import { useEffect, useState } from "react";

export function AddDeck() {
  const queryClient = useQueryClient();
  const { _ } = useLingui();
  const { addDeckMutation } = useAtomValue(queriesAtom);
  const { mutate, isSuccess } = useMutation(addDeckMutation());
  const [newId, setNewId] = useState<Deck["id"] | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const form = useAppForm({
    defaultValues: { title: "", algorithmId: 0, templateId: 0 } as InsertDeckData,
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
          queryClient.invalidateQueries({ queryKey: ["decks"] });
          queryClient.invalidateQueries({ queryKey: ["lessons"] });
        },
      });
    },
  });
  const formErrorMap = useStore(form.store, (state) => state.errorMap);
  const isLinkVisible = !!(isSuccess && newId);

  useEffect(() => {
    setNewId(null);
    form.reset();
  }, [isOpen, form]);

  return (
    <Dialog.Root isOpen={isOpen} onOpenChange={setIsOpen}>
      <Button variants={{ style: "primary", size: "icon" }} aria-label={_(msg`add-deck.trigger`)}>
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
              <Dialog.Title>{_(msg`add-deck.title`)}</Dialog.Title>
            </Dialog.Header>
            <Dialog.Content>
              <form.Field name="title">
                {(field) => (
                  <TextField
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={field.handleChange}
                    autoFocus
                  >
                    <Label>{_(msg`add-deck.inputs.title.label`)}</Label>
                    <TextField.Input />
                  </TextField>
                )}
              </form.Field>
              <form.Field name="algorithmId">
                {(field) => <AlgorithmPicker value={Number(field.state.value)} onChange={field.handleChange} />}
              </form.Field>
              <form.Field name="templateId">
                {(field) => <TemplatePicker value={Number(field.state.value)} onChange={field.handleChange} />}
              </form.Field>
              <div className="min-h-10">
                {formErrorMap.onSubmit && <form.Errors errors={formErrorMap.onSubmit} translations={decksMessages} />}
              </div>
            </Dialog.Content>
            <Dialog.Footer>
              {isLinkVisible && (
                <Link
                  className={link({ type: "added" })}
                  to="/decks/$deckId"
                  params={{ deckId: newId }}
                  onClick={() => setIsOpen(false)}
                >
                  {_(msg`add-deck.redirect.link`)}
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
                    {isLinkVisible ? (_(msg`add-deck.success`)) : (_(msg`add-deck.submit`))}
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
