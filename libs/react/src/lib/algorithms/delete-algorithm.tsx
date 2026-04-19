import { defaultAlgorithmAtom } from "@koloda/react";
import { queriesAtom, queryKeys } from "@koloda/react-base";
import type { Algorithm } from "@koloda/srs";
import { ERROR_MESSAGES, isAppError } from "@koloda/srs";
import { DeleteDialog, Fade, Select, Tooltip } from "@koloda/ui";
import { msg, plural } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useAtomValue } from "jotai";
import { AnimatePresence } from "motion/react";
import { useMemo, useState } from "react";

type DeleteAlgorithmProps = { id: Algorithm["id"] };

export function DeleteAlgorithm({ id }: DeleteAlgorithmProps) {
  const queryClient = useQueryClient();
  const { _ } = useLingui();
  const navigate = useNavigate({ from: "/algorithms/$algorithmId" });
  const defaultAlgorithm = useAtomValue(defaultAlgorithmAtom);
  const { getAlgorithmsQuery, getAlgorithmDecksQuery, deleteAlgorithmMutation } = useAtomValue(queriesAtom);
  const { data: algorithms } = useQuery({ queryKey: queryKeys.algorithms.all(), ...getAlgorithmsQuery() });
  const { data: decks } = useQuery({ queryKey: queryKeys.algorithms.decks(id), ...getAlgorithmDecksQuery(id) });
  const { mutate, reset, error } = useMutation(deleteAlgorithmMutation());
  const [successorId, setSuccessorId] = useState<Algorithm["id"] | null>(null);

  const handleOpenChange = (isOpen: boolean) => {
    if (isOpen) reset();
  };

  const handleConfirm = () => {
    mutate({ id, successorId }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: queryKeys.algorithms.all() });
        queryClient.removeQueries({ queryKey: queryKeys.algorithms.detail(id) });
        navigate({ to: "/algorithms" });
      },
    });
  };

  const filteredAlgorithms = useMemo(() => (
    algorithms?.filter((algorithm) => algorithm.id !== Number(id))
  ), [algorithms, id]);

  const isDefault = defaultAlgorithm === Number(id);
  const isDisabled = (algorithms && algorithms.length < 2) || isDefault;
  const message = isAppError(error) ? ERROR_MESSAGES[error.code] : ERROR_MESSAGES["db.delete"];

  return (
    <DeleteDialog onOpenChange={handleOpenChange}>
      <div className="relative">
        <DeleteDialog.Trigger isDisabled={isDisabled}>
          {_(msg`delete-algorithm.trigger`)}
        </DeleteDialog.Trigger>
        {isDisabled && (
          <Tooltip content={_(msg`delete-algorithm.cant-delete`)} delay={0}>
            <Tooltip.HiddenTrigger />
          </Tooltip>
        )}
      </div>
      <DeleteDialog.Frame>
        <AnimatePresence>
          {error
            ? (
              <Fade>
                {typeof message === "function" ? _(message(error)) : _(message)}
              </Fade>
            )
            : (
              <Fade>
                {decks && decks.length > 0
                  ? (
                    <>
                      <div className="flex flex-col gap-6">
                        <p>
                          {_(msg`${plural(decks.length, { other: "delete-algrorithm.used-by-#-decks" })}`)}
                        </p>
                        <p>{_(msg`delete-algorithm.successor-message`)}</p>
                      </div>
                      <Select
                        variants={{ class: "self-stretch" }}
                        label={_(msg`delete-algorithm.successor.label`)}
                        items={filteredAlgorithms}
                        value={successorId || (filteredAlgorithms ? filteredAlgorithms[0]?.id : null)}
                        onChange={(e) => setSuccessorId(Number(e))}
                        autoFocus
                      >
                        {({ id, title }) => (
                          <Select.ListBoxItem textValue={title} key={id}>
                            {title}
                          </Select.ListBoxItem>
                        )}
                      </Select>
                    </>
                  )
                  : _(msg`delete-algorithm.message`)}
              </Fade>
            )}
        </AnimatePresence>
        <DeleteDialog.Actions>
          <DeleteDialog.Cancel>{_(msg`delete-algorithm.cancel`)}</DeleteDialog.Cancel>
          <DeleteDialog.Confirm onClick={handleConfirm} isDisabled={!!error}>
            {_(msg`delete-algorithm.confirm`)}
          </DeleteDialog.Confirm>
        </DeleteDialog.Actions>
      </DeleteDialog.Frame>
    </DeleteDialog>
  );
}
