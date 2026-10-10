import { formatAppError } from "@koloda/app";
import type { ImportMode } from "@koloda/app";
import { queryKeys } from "@koloda/core-react";
import type { SyncQueries } from "@koloda/core-react";
import { Button, ErrorMessage } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { atom, useAtom } from "jotai";
import { useState } from "react";

// WHY: the join's probe count reaches the choice through here: the join dialog closes once the status says the choice
// waits. It exists only in the session that joined; a choice shown after a restart has none.
export const syncKnownIdsAtom = atom<number | null>(null);

export type SyncImportChoiceProps = { sync: SyncQueries };

// INVARIANT: a used database that joined syncs nothing until the user picks Add or Replace (`SYNC.md` §Add or Replace).
export function SyncImportChoice({ sync }: SyncImportChoiceProps) {
  const { _ } = useLingui();
  const queryClient = useQueryClient();
  const [knownIds, setKnownIds] = useAtom(syncKnownIdsAtom);
  const [isConfirmingReplace, setIsConfirmingReplace] = useState(false);
  const { mutate, error, isPending } = useMutation(sync.importMutation());
  const isCopy = (knownIds ?? 0) > 0;

  const handleImport = (mode: ImportMode) => {
    mutate(mode, {
      onSuccess: (status) => {
        setKnownIds(null);
        // WHY: Add remints ids and Replace deletes rows inside this call, which sends no change event per kind.
        void queryClient.invalidateQueries();
        queryClient.setQueryData(queryKeys.sync.status(), status);
      },
    });
  };

  if (isConfirmingReplace) {
    return (
      <div className="flex flex-col gap-4">
        <p>{_(msg`settings.sync.import.replace.message`)}</p>
        {error && <ErrorMessage {...formatAppError(error, _)} layout="inline" />}
        <div className="flex flex-row flex-wrap gap-2">
          <Button variants={{ style: "primary" }} onPress={() => handleImport("replace")} isDisabled={isPending}>
            {_(msg`settings.sync.import.replace.confirm`)}
          </Button>
          <Button variants={{ style: "ghost" }} onPress={() => setIsConfirmingReplace(false)} isDisabled={isPending}>
            {_(msg`settings.sync.back`)}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p>{isCopy ? _(msg`settings.sync.import.copy`) : _(msg`settings.sync.import.message`)}</p>
      {error && <ErrorMessage {...formatAppError(error, _)} layout="inline" />}
      <div className="flex flex-row flex-wrap gap-2">
        <Button
          variants={{ style: isCopy ? "bordered" : "primary" }}
          onPress={() => handleImport("add")}
          isDisabled={isPending}
        >
          {_(msg`settings.sync.import.add`)}
        </Button>
        <Button
          variants={{ style: isCopy ? "primary" : "bordered" }}
          onPress={() => setIsConfirmingReplace(true)}
          isDisabled={isPending}
        >
          {isCopy ? _(msg`settings.sync.import.replace.recommended`) : _(msg`settings.sync.import.replace`)}
        </Button>
      </div>
    </div>
  );
}
