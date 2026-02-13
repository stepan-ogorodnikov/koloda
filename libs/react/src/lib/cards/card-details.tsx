import { cardsQueryKeys, queriesAtom, QueryState, reviewsQueryKeys, templatesQueryKeys } from "@koloda/react";
import type { Card, UpdateCardValues, ZodIssue } from "@koloda/srs";
import { getUpdateCardSchema, toFormErrors, updateCardSchema as schema } from "@koloda/srs";
import { Button, FormLayout, Label, TextField, useAppForm } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { RotateCcw } from "lucide-react";
import { useEffect } from "react";
import { CardReviews } from "./card-reviews";
import { CardState } from "./card-state";
import { DeleteCard } from "./delete-card";

const TIMESTAMP_OPTIONS = {
  year: "numeric",
  month: "long",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
} as Intl.DateTimeFormatOptions;

type CardDetailsProps = { card: Card };

export function CardDetails({ card }: CardDetailsProps) {
  const queryClient = useQueryClient();
  const { i18n, _ } = useLingui();
  const { getTemplateQuery, updateCardMutation, resetCardProgressMutation } = useAtomValue(queriesAtom);
  const query = useQuery({
    queryKey: templatesQueryKeys.detail(card.templateId),
    ...getTemplateQuery(card.templateId),
  });
  const template = query.data;
  const { mutate } = useMutation(updateCardMutation());
  const resetProgressMutation = useMutation(resetCardProgressMutation());
  const form = useAppForm({
    defaultValues: card as UpdateCardValues,
    validators: { onSubmit: template ? getUpdateCardSchema(template) : schema },
    onSubmit: async ({ formApi, value }) => {
      mutate({ id: card.id, values: value }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: cardsQueryKeys.deck({ deckId: card.deckId }) });
        },
        onError: (error) => {
          formApi.setErrorMap({ onSubmit: toFormErrors(error) });
        },
      });
    },
  });

  useEffect(() => {
    form.reset();
  }, [card.id, card.updatedAt, form]);

  const handleProgressReset = () => {
    resetProgressMutation.mutate({ id: card.id }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: cardsQueryKeys.deck({ deckId: card.deckId }) });
        queryClient.invalidateQueries({ queryKey: reviewsQueryKeys.card({ cardId: card.id }) });
      },
    });
  };

  return (
    <QueryState query={query}>
      {(data) => (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            e.stopPropagation();
            form.handleSubmit();
          }}
        >
          <FormLayout.Section>
            <form.Timestamps>
              <form.Timestamp>ID: {card?.id}</form.Timestamp>
              <form.CreatedAt timestamp={card?.createdAt} />
              <form.UpdatedAt timestamp={card?.updatedAt} />
            </form.Timestamps>
          </FormLayout.Section>
          {data.content.fields.map(({ id, title }) => (
            <form.AppField name={`content.${id}.text`} key={id}>
              {(field) => (
                <field.TextField variants={{ layout: "form" }}>
                  <Label variants={{ layout: "form" }}>{title}</Label>
                  <TextField.Content>
                    <TextField.TextArea variants={{ layout: "form" }} />
                    {!field.state.meta.isValid && <TextField.Errors errors={field.state.meta.errors as ZodIssue[]} />}
                  </TextField.Content>
                </field.TextField>
              )}
            </form.AppField>
          ))}
          <FormLayout.Section term={_(msg`card.labels.state`)}>
            <FormLayout.Section.Content>
              <CardState value={card.state as number} />
            </FormLayout.Section.Content>
          </FormLayout.Section>
          {!!card.state && !!card.dueAt && (
            <FormLayout.Section term={_(msg`card.labels.due-at`)}>
              <FormLayout.Section.Content variants={{ class: "fg-level-3" }}>
                {i18n.date(card.dueAt, TIMESTAMP_OPTIONS)}
              </FormLayout.Section.Content>
            </FormLayout.Section>
          )}
          {!!card.state && (
            <FormLayout.Section term={_(msg`card.labels.stability`)}>
              <FormLayout.Section.Content variants={{ class: "numbers-text" }}>
                {(card.stability ?? 0).toFixed(2)}
              </FormLayout.Section.Content>
            </FormLayout.Section>
          )}
          {!!card.state && (
            <FormLayout.Section term={_(msg`card.labels.difficulty`)}>
              <FormLayout.Section.Content variants={{ class: "numbers-text" }}>
                {(card.difficulty ?? 0).toFixed(2)}
              </FormLayout.Section.Content>
            </FormLayout.Section>
          )}
          {!!card.state && (
            <FormLayout.Section term={_(msg`card.labels.lapses`)}>
              <FormLayout.Section.Content variants={{ class: "numbers-text" }}>
                {card.lapses}
              </FormLayout.Section.Content>
            </FormLayout.Section>
          )}
          {!!card.state && (
            <FormLayout.Section term={_(msg`card.labels.reviews`)}>
              <FormLayout.Section.Content>
                <CardReviews card={card} />
              </FormLayout.Section.Content>
            </FormLayout.Section>
          )}
          <FormLayout.Section term={_(msg`card.labels.actions`)}>
            <FormLayout.Section.Content>
              <div className="flex flex-row flex-wrap items-center gap-2">
                {!!card.state && (
                  <Button variants={{ style: "primary" }} onClick={handleProgressReset}>
                    <RotateCcw className="size-4 stroke-1.5" />
                    {_(msg`card.action.reset-progress`)}
                  </Button>
                )}
                <DeleteCard id={card.id} deckId={card.deckId} />
              </div>
            </FormLayout.Section.Content>
          </FormLayout.Section>
          <form.AppForm>
            <form.Controls />
          </form.AppForm>
        </form>
      )}
    </QueryState>
  );
}
