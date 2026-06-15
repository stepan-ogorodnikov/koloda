import { getConversationName } from "@koloda/ai";
import type { Conversation } from "@koloda/app";
import { queriesAtom, queryKeys } from "@koloda/core-react";
import { Link, QueryState, useMotionSetting } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useQuery } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { isConversationState } from "./conversation-state";

export function AssistantConversationsList() {
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
                key={conversation.id}
                conversation={conversation}
                fallback={fallback}
              />
            ))}
          </div>
        );
      }}
    </QueryState>
  );
}

const conversationItem = [
  "p-2 rounded-lg fg-level-3 text-base whitespace-nowrap truncate focus-ring animate-colors",
  "hover:bg-main-sidebar-link-active current:bg-main-sidebar-link-active current:fg-level-1",
].join(" ");

type ConversationItemProps = {
  conversation: Conversation;
  fallback: string;
};

function ConversationItem({ conversation, fallback }: ConversationItemProps) {
  const isMotionOn = useMotionSetting();
  const name = isConversationState(conversation.state)
    ? getConversationName(conversation.state, fallback)
    : fallback;

  return (
    <Link
      className={conversationItem}
      to="/ai"
      search={{ conversationId: conversation.id }}
      viewTransition={isMotionOn}
      key={conversation.id}
    >
      {name}
    </Link>
  );
}
