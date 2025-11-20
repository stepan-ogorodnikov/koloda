import { queriesAtom } from "@koloda/react";
import type { Deck, Template } from "@koloda/srs";
import { Button, Dialog } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { useEffect, useReducer, useRef } from "react";
import { ZodError } from "zod";
import { AddCardFieldsItem } from "./add-card-fields-item";
import { addCardReducer, addCardReducerDefault } from "./add-card-reducer";

type AddCardProps = {
  deckId: Deck["id"];
  templateId: Template["id"];
};

export function AddCard({ deckId, templateId }: AddCardProps) {
  const queryClient = useQueryClient();
  const { _ } = useLingui();
  const { getTemplateQuery, addCardMutation } = useAtomValue(queriesAtom);
  const { data } = useQuery({ queryKey: ["templates", `${templateId}`], ...getTemplateQuery(`${templateId}`) });
  const { mutate } = useMutation(addCardMutation());
  const [state, dispatch] = useReducer(addCardReducer, addCardReducerDefault);
  const firstFieldRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (data) dispatch(["fieldsSet", data.content.fields]);
  }, [data]);

  const handleSubmit = () => (
    mutate({ content: state.content, deckId, templateId }, {
      onSuccess: () => {
        dispatch(["formReset"]);
        queryClient.invalidateQueries({ queryKey: ["cards", `${deckId}`] });
        firstFieldRef.current?.focus();
      },
      onError: (error) => {
        if (error instanceof ZodError) dispatch(["errorReceived", error.issues]);
      },
    })
  );

  return (
    <>
      <Dialog.Header>
        <Dialog.Title>Add cards</Dialog.Title>
        <div className="grow" />
        <Dialog.Close slot="close" />
      </Dialog.Header>
      <Dialog.Content variants={{ class: "pb-6" }}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            e.stopPropagation();
            handleSubmit();
          }}
        >
          {state.fields.map((field, i) => (
            <AddCardFieldsItem
              field={field}
              value={state.content[`${field.id}`]}
              dispatch={dispatch}
              autoFocus={i === 0}
              ref={i === 0 ? firstFieldRef : undefined}
              errors={state.errors?.[`${field.id}`]}
              key={field.id}
            />
          ))}
          <button className="hidden" type="submit" />
        </form>
      </Dialog.Content>
      <Dialog.Footer>
        <Button
          variants={{ style: "primary" }}
          onClick={handleSubmit}
        >
          {_(msg`add-card.submit`)}
        </Button>
      </Dialog.Footer>
    </>
  );
}
