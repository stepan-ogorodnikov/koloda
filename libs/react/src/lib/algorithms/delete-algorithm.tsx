import { defaultAlgorithmAtom, queriesAtom } from "@koloda/react";
import { DeleteDialog, Select, Tooltip } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { Plural } from "@lingui/react/macro";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useAtomValue } from "jotai";
import { useMemo, useState } from "react";
import type { Key } from "react-aria-components";

type DeleteAlgorithmProps = { id: string };

export function DeleteAlgorithm({ id }: DeleteAlgorithmProps) {
  const queryClient = useQueryClient();
  const { _ } = useLingui();
  const navigate = useNavigate({ from: "/algorithms/$algorithmId" });
  const defaultAlgorithm = useAtomValue(defaultAlgorithmAtom);
  const { getAlgorithmsQuery, getAlgorithmDecksQuery, deleteAlgorithmMutation } = useAtomValue(queriesAtom);
  const { data: algorithms } = useQuery({ queryKey: ["algorithms"], ...getAlgorithmsQuery() });
  const { data: decks } = useQuery({ queryKey: ["algorithm_decks", id], ...getAlgorithmDecksQuery(id) });
  const { mutate } = useMutation(deleteAlgorithmMutation());
  const [successorId, setSuccessorId] = useState<Key | null>(null);

  const handleConfirm = () => {
    mutate({ id, successorId }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["algorithms"] });
        queryClient.removeQueries({ queryKey: ["algorithms", id] });
        navigate({ to: "/algorithms" });
      },
    });
  };

  const filteredAlgorithms = useMemo(() => (
    algorithms?.filter((algorithm) => algorithm.id !== Number(id))
  ), [algorithms, id]);

  const isDefault = defaultAlgorithm === Number(id);
  const isDisabled = (algorithms && algorithms.length < 2) || isDefault;

  return (
    <DeleteDialog>
      <div className="relative">
        <DeleteDialog.Trigger isDisabled={isDisabled}>
          {_(msg`delete-algorithm.trigger`)}
        </DeleteDialog.Trigger>
        {isDisabled && (
          <Tooltip content={_(msg`delete-algorithm.cant-delete`)} delay={0} isDisabled={!isDisabled}>
            <Tooltip.HiddenTrigger />
          </Tooltip>
        )}
      </div>
      {decks && decks.length > 0
        ? (
          <DeleteDialog.Frame>
            <div className="flex flex-col gap-6">
              <p>
                <Plural value={decks.length} other="algorithm-used-by-#-decks" />
              </p>
              <p>{_(msg`delete-algorithm.successor-message`)}</p>
            </div>
            <Select
              variants={{ class: "self-stretch" }}
              label={_(msg`delete-algorithm.successor.label`)}
              items={filteredAlgorithms}
              selectedKey={successorId || (filteredAlgorithms ? filteredAlgorithms[0]?.id : null)}
              onSelectionChange={setSuccessorId}
              autoFocus
            >
              {({ id, title }) => (
                <Select.ListBoxItem textValue={title} key={id}>
                  {title}
                </Select.ListBoxItem>
              )}
            </Select>
            <DeleteDialog.Actions>
              <DeleteDialog.Cancel>{_(msg`delete-algorithm.cancel`)}</DeleteDialog.Cancel>
              <DeleteDialog.Confirm onClick={handleConfirm}>{_(msg`delete-algorithm.confirm`)}</DeleteDialog.Confirm>
            </DeleteDialog.Actions>
          </DeleteDialog.Frame>
        )
        : (
          <DeleteDialog.Frame>
            {_(msg`delete-algorithm.message`)}
            <DeleteDialog.Actions>
              <DeleteDialog.Cancel>{_(msg`delete-algorithm.cancel`)}</DeleteDialog.Cancel>
              <DeleteDialog.Confirm onClick={handleConfirm}>{_(msg`delete-algorithm.confirm`)}</DeleteDialog.Confirm>
            </DeleteDialog.Actions>
          </DeleteDialog.Frame>
        )}
    </DeleteDialog>
  );
}
