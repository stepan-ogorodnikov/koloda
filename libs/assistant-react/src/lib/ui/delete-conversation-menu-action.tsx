import { Delete03Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { conversationHasTurns } from "@koloda/app";
import { Button } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { atom, useAtomValue } from "jotai";
import { useMemo } from "react";
import { conversationsAtom } from "../state/conversation-store";

export type DeleteConversationMenuActionProps = {
  id: string;
  onDraftDelete: () => void;
  onRequestConfirm: () => void;
};

export function DeleteConversationMenuAction({
  id,
  onDraftDelete,
  onRequestConfirm,
}: DeleteConversationMenuActionProps) {
  const { _ } = useLingui();
  const hasTurnsAtom = useMemo(
    () =>
      atom((get) => {
        const state = get(conversationsAtom)[id];
        return state ? conversationHasTurns(state) : false;
      }),
    [id],
  );
  const hasTurns = useAtomValue(hasTurnsAtom);

  return (
    <Button
      variants={{ style: "ghost", class: "justify-start px-2" }}
      onPress={() => {
        if (hasTurns) onRequestConfirm();
        else onDraftDelete();
      }}
    >
      <HugeiconsIcon className="size-5 min-w-5" strokeWidth={1.75} icon={Delete03Icon} aria-hidden="true" />
      {_(msg`ai.conversation.delete.action`)}
    </Button>
  );
}
