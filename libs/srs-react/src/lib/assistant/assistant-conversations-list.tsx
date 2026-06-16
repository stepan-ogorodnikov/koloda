import { getConversationName } from "@koloda/ai";
import type { Conversation } from "@koloda/app";
import { queriesAtom, queryKeys } from "@koloda/core-react";
import { Link, QueryState, useMotionSetting } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useQuery } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { coerceConversationState } from "./conversation-state";
import { DeleteConversationButton } from "./delete-conversation-button";

type AssistantConversationsListProps = {
  activeId?: string;
  onActiveDeleted?: () => void;
};

export function AssistantConversationsList({ activeId, onActiveDeleted }: AssistantConversationsListProps) {
  const { _ } = useLingui();
  const { getConversationsQuery } = useAtomValue(queriesAtom);
  const query = useQuery({ queryKey: queryKeys.conversations.all(), ...getConversationsQuery() });
  const fallback = _(msg`ai.conversation.untitled`);

  return (
    <QueryState query={query}>
      {(data) => {
        if (data.length === 0) return null;
        return (
          <div className="flex flex-col gap-1 p-2">
            {data.map((conversation) => (
              <ConversationItem
                conversation={conversation}
                fallback={fallback}
                isActive={conversation.id === activeId}
                onActiveDeleted={onActiveDeleted}
                key={conversation.id}
              />
            ))}
          </div>
        );
      }}
    </QueryState>
  );
}

const conversationItem = [
  "grow min-w-0 p-2 rounded-lg fg-level-3 text-base whitespace-nowrap truncate focus-ring animate-colors",
  "group-hover:bg-main-sidebar-link-active current:bg-main-sidebar-link-active current:fg-level-1",
].join(" ");

type ConversationItemProps = {
  conversation: Conversation;
  fallback: string;
  isActive: boolean;
  onActiveDeleted?: () => void;
};

function ConversationItem({ conversation, fallback, isActive, onActiveDeleted }: ConversationItemProps) {
  const isMotionOn = useMotionSetting();
  const coerced = coerceConversationState(conversation.state);
  const name = coerced
    ? getConversationName(coerced, fallback)
    : fallback;

  return (
    <div className="group relative flex flex-row items-center">
      <Link
        className={conversationItem}
        to="/ai"
        search={{ conversationId: conversation.id }}
        viewTransition={isMotionOn}
        key={conversation.id}
      >
        {name}
      </Link>
      <div className="absolute right-1 top-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 animate-opacity">
        <DeleteConversationButton
          id={conversation.id}
          isActive={isActive}
          onActiveDeleted={onActiveDeleted}
        />
      </div>
    </div>
  );
}
