import { ChangeScreenModeIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useAtomValue, useSetAtom } from "jotai";
import { useCallback, useMemo } from "react";
import { assistantConversationHasContextAtom, cloneConversationAtom } from "./assistant-conversation-atoms";

export type CloneConversationButtonProps = {
  id: string;
  onClone?: (newId: string) => void;
  onClose?: () => void;
};

export function CloneConversationButton({ id, onClone, onClose }: CloneConversationButtonProps) {
  const { _ } = useLingui();
  const clone = useSetAtom(cloneConversationAtom);
  // WHY: Don't clone empty conversation
  const hasContextAtom = useMemo(() => assistantConversationHasContextAtom(id), [id]);
  const hasContext = useAtomValue(hasContextAtom);

  const handlePress = useCallback(() => {
    const newId = clone({ sourceId: id });
    if (newId) onClone?.(newId);
    onClose?.();
  }, [clone, id, onClone, onClose]);

  return (
    <Button
      variants={{ style: "ghost", class: "justify-start px-2" }}
      onPress={handlePress}
      isDisabled={!hasContext}
    >
      <HugeiconsIcon className="size-5 min-w-5" strokeWidth={1.75} icon={ChangeScreenModeIcon} aria-hidden="true" />
      {_(msg`ai.conversation.clone.action`)}
    </Button>
  );
}
