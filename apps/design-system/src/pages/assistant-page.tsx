import { queriesAtom } from "@koloda/core-react";
import {
  AssistantChat,
  AssistantConversationsList,
  AssistantNewConversationButton,
  CONVERSATION_TITLE_FALLBACK,
  ConversationHeaderMenu,
  startParamlessConversationAtom,
} from "@koloda/assistant-react";
import { Layout, useLayoutHeaderScrollShadow, useRouteFocus } from "@koloda/ui";
import { useLingui } from "@lingui/react";
import { useQuery } from "@tanstack/react-query";
import { getRouteApi } from "@tanstack/react-router";
import { useAtomValue, useSetAtom } from "jotai";
import { useCallback } from "react";
import { tv } from "tailwind-variants";

const assistantRoute = getRouteApi("/ai");

const conversationTitle = tv({
  base: "min-w-0",
  variants: {
    isUntitled: { true: "fg-disabled" },
  },
  defaultVariants: { isUntitled: false },
});

export function AssistantPage() {
  const { _ } = useLingui();
  const ref = useRouteFocus();
  useLayoutHeaderScrollShadow(ref);
  const navigate = assistantRoute.useNavigate();
  const { conversationId } = assistantRoute.useSearch();
  const startParamlessConversation = useSetAtom(startParamlessConversationAtom);
  const { getConversationsQuery } = useAtomValue(queriesAtom);
  const { data: conversations } = useQuery(getConversationsQuery());
  const title = conversations?.find((conversation) => conversation.id === conversationId)?.title;

  const openConversation = useCallback(
    (id: string) => navigate({ search: { conversationId: id }, replace: true }),
    [navigate],
  );

  const startNewConversation = useCallback(() => {
    startParamlessConversation();
    navigate({ search: { conversationId: undefined }, replace: true });
  }, [navigate, startParamlessConversation]);

  return (
    <>
      <Layout.Sidebar>
        <AssistantNewConversationButton conversationId={conversationId} onStartNewConversation={startNewConversation} />
        <AssistantConversationsList activeId={conversationId} onActiveDeleted={startNewConversation} />
      </Layout.Sidebar>
      <Layout.Content isAlwaysVisible>
        <Layout.Header>
          <div className="flex flex-row flex-nowrap items-center min-w-0 w-full max-w-3xl mx-auto">
            <Layout.H1 variants={{ class: conversationTitle({ isUntitled: !title }) }}>
              {title || _(CONVERSATION_TITLE_FALLBACK)}
            </Layout.H1>
            {conversationId && (
              <div className="flex flex-row shrink-0 items-center gap-1 px-2">
                <ConversationHeaderMenu
                  conversationId={conversationId}
                  onClone={openConversation}
                  onActiveDeleted={startNewConversation}
                />
              </div>
            )}
          </div>
        </Layout.Header>
        <Layout.Container ref={ref} tabIndex={-1}>
          <AssistantChat
            conversationId={conversationId}
            onConversationIdChange={openConversation}
            onActiveDeleted={startNewConversation}
            onStartNewConversation={startNewConversation}
          />
        </Layout.Container>
      </Layout.Content>
    </>
  );
}
