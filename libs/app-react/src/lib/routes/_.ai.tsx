import { clearActiveConversationId, getActiveConversationId, setActiveConversationId } from "@koloda/app";
import { queriesAtom, useTitle } from "@koloda/core-react";
import {
  AssistantChat,
  AssistantConversationsList,
  AssistantNewConversationButton,
  CONVERSATION_TITLE_FALLBACK,
  ConversationHeaderMenu,
  startParamlessConversationAtom,
} from "@koloda/assistant-react";
import { Layout, useLayoutHeaderScrollShadow, useRouteFocus } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useAtomValue, useSetAtom } from "jotai";
import { useCallback, useEffect, useMemo } from "react";
import { SettingsAIAddProfile } from "@koloda/settings-react";

export const Route = createFileRoute("/_/ai")({
  component: AIRoute,
  validateSearch: (search: Record<string, unknown>) => ({
    conversationId: typeof search.conversationId === "string" ? search.conversationId : undefined,
  }),
  loader: ({ context: { queryClient, queries } }) => {
    const { getAIProfilesQuery, getConversationsQuery } = queries;
    queryClient.ensureQueryData(getAIProfilesQuery());
    queryClient.ensureQueryData(getConversationsQuery());
    return { title: msg`title.ai` };
  },
});

function AIRoute() {
  useTitle();
  const { _ } = useLingui();
  const ref = useRouteFocus();
  useLayoutHeaderScrollShadow(ref);
  const navigate = Route.useNavigate();
  const { conversationId } = Route.useSearch();
  const startParamlessConversation = useSetAtom(startParamlessConversationAtom);
  const { getConversationsQuery } = useAtomValue(queriesAtom);
  const conversationsQuery = useQuery(getConversationsQuery());
  const conversations = useMemo(() => conversationsQuery.data || [], [conversationsQuery.data]);
  const { title } =
    useMemo(() => conversations.find((c) => c.id === conversationId), [conversations, conversationId]) || {};

  useEffect(() => {
    if (conversationId) {
      setActiveConversationId(conversationId);
      return;
    }
    const stored = getActiveConversationId();
    if (stored) {
      navigate({ search: { conversationId: stored }, replace: true });
    }
  }, [conversationId, navigate]);

  const handleConversationIdChange = useCallback(
    (id: string) => {
      setActiveConversationId(id);
      navigate({ search: { conversationId: id }, replace: true });
    },
    [navigate],
  );

  // WHY: Clear the stored active id before navigating to param-less /ai.
  // Restore only runs when a stored id exists, so this is what distinguishes
  // New / delete-of-open / session reset from a cold visit that should bounce
  // back to the last conversation.
  const handleStartNewConversation = useCallback(() => {
    clearActiveConversationId();
    startParamlessConversation();
    navigate({ search: {}, replace: true });
  }, [navigate, startParamlessConversation]);

  const handlePrevConversation = useCallback(() => {
    if (!conversationId || conversations.length === 0) return;
    const idx = conversations.findIndex((c) => c.id === conversationId);
    if (idx > 0) handleConversationIdChange(conversations[idx - 1].id);
  }, [conversations, conversationId, handleConversationIdChange]);

  const handleNextConversation = useCallback(() => {
    if (!conversationId || conversations.length === 0) return;
    const idx = conversations.findIndex((c) => c.id === conversationId);
    if (idx < conversations.length - 1) handleConversationIdChange(conversations[idx + 1].id);
  }, [conversations, conversationId, handleConversationIdChange]);

  return (
    <>
      <Layout.Sidebar>
        <AssistantNewConversationButton onStartNewConversation={handleStartNewConversation} />
        <AssistantConversationsList activeId={conversationId} onActiveDeleted={handleStartNewConversation} />
      </Layout.Sidebar>
      <Layout.Content isAlwaysVisible>
        <Layout.Header>
          <div className="flex flex-row flex-nowrap items-center min-w-0 w-full max-w-3xl mx-auto">
            <Layout.H1 variants={{ class: title ? "min-w-0" : "min-w-0 fg-disabled" }}>
              {title || _(CONVERSATION_TITLE_FALLBACK)}
            </Layout.H1>
            {conversationId && (
              <div className="flex flex-row shrink-0 items-center gap-1 px-2">
                <ConversationHeaderMenu conversationId={conversationId} onClone={handleConversationIdChange} />
              </div>
            )}
          </div>
        </Layout.Header>
        <Layout.Container ref={ref} tabIndex={-1}>
          <AssistantChat
            conversationId={conversationId}
            onConversationIdChange={handleConversationIdChange}
            onActiveDeleted={handleStartNewConversation}
            onStartNewConversation={handleStartNewConversation}
            onPrevConversation={handlePrevConversation}
            onNextConversation={handleNextConversation}
            renderAddProfileDialog={(props) => <SettingsAIAddProfile trigger="none" {...props} />}
          />
        </Layout.Container>
      </Layout.Content>
    </>
  );
}
