import type { ConversationListItem } from "@koloda/app";
import { queriesAtom, queryKeys } from "@koloda/core-react";
import { Link, QueryState, useMotionSetting } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useQuery } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { conversationsAtom, unreadConversationIdsAtom } from "./assistant-conversation-atoms";
import { DeleteConversationButton } from "./delete-conversation-button";

export const CONVERSATION_TITLE_FALLBACK = msg`ai.conversation.untitled`;
export const CONVERSATION_RUNNING_LABEL = msg`ai.conversation.running`;
export const CONVERSATION_UNREAD_LABEL = msg`ai.conversation.unread`;

type AssistantConversationsListProps = {
  activeId?: string;
  onActiveDeleted?: () => void;
};

export function AssistantConversationsList({ activeId, onActiveDeleted }: AssistantConversationsListProps) {
  const { _ } = useLingui();
  const { getConversationsQuery } = useAtomValue(queriesAtom);
  const conversations = useAtomValue(conversationsAtom);
  const unreadIds = useAtomValue(unreadConversationIdsAtom);
  const query = useQuery({ queryKey: queryKeys.conversations.all(), ...getConversationsQuery() });

  return (
    <QueryState query={query}>
      {(data) => {
        if (data.length === 0) return null;
        return (
          <div className="flex flex-col gap-1 p-2">
            {data.map((conversation) => (
              <ConversationItem
                conversation={conversation}
                fallback={_(CONVERSATION_TITLE_FALLBACK)}
                isActive={conversation.id === activeId}
                hasActiveRun={conversations[conversation.id]?.activeRunId != null}
                hasUnread={unreadIds.has(conversation.id)}
                runningLabel={_(CONVERSATION_RUNNING_LABEL)}
                unreadLabel={_(CONVERSATION_UNREAD_LABEL)}
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
  conversation: ConversationListItem;
  fallback: string;
  isActive: boolean;
  hasActiveRun: boolean;
  hasUnread: boolean;
  runningLabel: string;
  unreadLabel: string;
  onActiveDeleted?: () => void;
};

function ConversationItem({
  conversation,
  fallback,
  isActive,
  hasActiveRun,
  hasUnread,
  runningLabel,
  unreadLabel,
  onActiveDeleted,
}: ConversationItemProps) {
  const isMotionOn = useMotionSetting();
  const name = conversation.title ?? fallback;
  // WHY: The active-run pulse is more salient than the unread dot, so it
  // wins when both are true. Keeping the order explicit avoids showing
  // an unread dot for a run the user is actively watching.
  const showActive = hasActiveRun;
  const showUnread = !showActive && hasUnread;

  return (
    <div className="group relative flex flex-row items-center">
      <Link
        className={conversationItem}
        to="/ai"
        search={{ conversationId: conversation.id }}
        viewTransition={isMotionOn}
        key={conversation.id}
      >
        <span className="flex items-center gap-2 min-w-0">
          <span className="flex items-center justify-center w-4">
            {showActive
              ? (
                <div
                  className="size-2 rounded-full bg-fg-level-4 animate-pulse"
                  aria-label={runningLabel}
                />
              )
              : showUnread
              ? (
                <div
                  className="size-2 rounded-full bg-fg-link"
                  aria-label={unreadLabel}
                />
              )
              : null}
          </span>
          <span className="truncate">{name}</span>
        </span>
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
