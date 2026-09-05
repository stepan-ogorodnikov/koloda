import type { ConversationListItem } from "@koloda/app";
import { queriesAtom } from "@koloda/core-react";
import { Link, QueryState, useMotionSetting } from "@koloda/ui";
import { tv } from "tailwind-variants";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useQuery } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { useRef } from "react";
import { unreadConversationIdsAtom } from "../state/conversation-selectors";
import { conversationsAtom } from "../state/conversation-store";
import { ConversationListTimestamp } from "./conversation-list-timestamp";
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
  const query = useQuery(getConversationsQuery());

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

const conversationLink = [
  "group flex min-w-0 items-center gap-2 rounded-lg p-1 fg-level-2 text-base animate-colors focus-ring",
  "hover:bg-main-sidebar-link-active data-current:bg-main-sidebar-link-active data-current:fg-level-1",
].join(" ");

const conversationTitle = tv({
  base: "flex-1 min-w-0 truncate",
  variants: {
    isDraft: { true: "fg-level-4" },
  },
  defaultVariants: { isDraft: false },
});

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
  // WHY: Delete sits inside a row Link. Hover-reveal can collapse and the
  // confirmation dialog can retarget the pointer before click, so button-only
  // stopPropagation still navigates. The pointerdown ref, click-capture
  // preventDefault, and closest("button") check are one trap — dropping any
  // piece re-enables navigation on delete.
  const ignoreLinkClickRef = useRef(false);
  // WHY: The active-run pulse is more salient than the unread dot, so it
  // wins when both are true. Keeping the order explicit avoids showing
  // an unread dot for a run the user is actively watching.
  const showActive = hasActiveRun;
  const showUnread = !showActive && hasUnread;

  return (
    <Link
      className={conversationLink}
      to="/ai"
      search={{ conversationId: conversation.id }}
      viewTransition={isMotionOn}
      onClick={(event) => {
        if (ignoreLinkClickRef.current || (event.target instanceof Element && event.target.closest("button"))) {
          event.preventDefault();
        }
        ignoreLinkClickRef.current = false;
      }}
    >
      <span className="flex shrink-0 items-center justify-center w-4">
        {showActive ? (
          <div className="size-2 rounded-full bg-fg-level-4 animate-pulse" aria-label={runningLabel} />
        ) : showUnread ? (
          <div className="size-2 rounded-full bg-fg-link" aria-label={unreadLabel} />
        ) : null}
      </span>
      <span className={conversationTitle({ isDraft: !conversation.hasTurns })} data-has-turns={conversation.hasTurns}>
        {name}
      </span>
      <div className="flex shrink-0 items-center gap-1">
        <div
          className="flex w-0 items-center overflow-hidden group-hover:w-8 group-focus-within:w-8"
          onPointerDownCapture={() => {
            ignoreLinkClickRef.current = true;
          }}
          onClickCapture={(event) => {
            event.preventDefault();
          }}
        >
          <DeleteConversationButton
            id={conversation.id}
            hasTurns={conversation.hasTurns}
            isActive={isActive}
            onActiveDeleted={onActiveDeleted}
          />
        </div>
        <ConversationListTimestamp
          className="fg-level-4 text-sm font-medium text-end select-none"
          timestamp={conversation.updatedAt ?? conversation.createdAt}
        />
      </div>
    </Link>
  );
}
