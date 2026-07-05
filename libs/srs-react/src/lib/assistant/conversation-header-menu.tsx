import { MoreVerticalIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button, Dialog } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useAtomValue } from "jotai";
import { useMemo, useState } from "react";
import { assistantConversationHasContextAtom } from "./assistant-conversation-atoms";
import { CloneConversationButton } from "./clone-conversation-button";

export type ConversationHeaderMenuProps = {
  conversationId: string;
  onClone?: (newId: string) => void;
};

export function ConversationHeaderMenu({ conversationId, onClone }: ConversationHeaderMenuProps) {
  const { _ } = useLingui();
  const [isOpen, setIsOpen] = useState(false);
  const hasContextAtom = useMemo(() => assistantConversationHasContextAtom(conversationId), [conversationId]);
  const hasContext = useAtomValue(hasContextAtom);

  return (
    <Dialog.Root isOpen={isOpen} onOpenChange={setIsOpen}>
      <Button
        variants={{ style: "ghost", size: "smallIcon" }}
        aria-label={_(msg`ai.conversation.menu.trigger`)}
        isDisabled={!hasContext}
      >
        <HugeiconsIcon
          className="size-5 min-w-5"
          strokeWidth={1.75}
          icon={MoreVerticalIcon}
          aria-hidden="true"
        />
      </Button>
      <Dialog.Popover placement="bottom end">
        <Dialog.Body>
          <Dialog.Content variants={{ class: "min-w-48 p-1" }}>
            <CloneConversationButton
              id={conversationId}
              onClone={onClone}
              onClose={() => setIsOpen(false)}
            />
          </Dialog.Content>
        </Dialog.Body>
      </Dialog.Popover>
    </Dialog.Root>
  );
}
