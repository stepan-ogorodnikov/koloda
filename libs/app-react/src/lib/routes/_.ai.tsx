import { clearActiveConversationId, getActiveConversationId, setActiveConversationId } from "@koloda/app";
import { queriesAtom, useTitle } from "@koloda/core-react";
import {
  AssistantChat,
  AssistantConversationsList,
  AssistantNewConversationButton,
  CONVERSATION_TITLE_FALLBACK,
  ConversationHeaderMenu,
  newConversationAtom,
  setAssistantDeckAtom,
  useGlobalAIProfileState,
} from "@koloda/srs-react";
import { Layout, useLayoutHeaderScrollShadow, useRouteFocus } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useAtomValue, useSetAtom } from "jotai";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { SettingsAIAddProfile } from "../settings/settings-ai-add-profile";

export const Route = createFileRoute("/_/ai")({
  component: AIRoute,
  validateSearch: (search: Record<string, unknown>) => ({
    conversationId: typeof search.conversationId === "string" ? search.conversationId : undefined,
    deckId: typeof search.deckId === "string" || typeof search.deckId === "number" ? Number(search.deckId) : undefined,
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
  const { conversationId, deckId: deckIdFromSearch } = Route.useSearch();
  const setDeck = useSetAtom(setAssistantDeckAtom);
  const newConversation = useSetAtom(newConversationAtom);
  const { getConversationsQuery } = useAtomValue(queriesAtom);
  const conversationsQuery = useQuery(getConversationsQuery());
  const conversations = useMemo(() => conversationsQuery.data || [], [conversationsQuery.data]);
  const { title } =
    useMemo(() => conversations.find((c) => c.id === conversationId), [conversations, conversationId]) || {};
  const [globalAIProfileState] = useGlobalAIProfileState();
  const creatingFromDeckRef = useRef(false);

  useEffect(() => {
    if (conversationId) {
      setActiveConversationId(conversationId);
      creatingFromDeckRef.current = false;
      return;
    }
    if (deckIdFromSearch !== undefined) {
      if (creatingFromDeckRef.current) return;
      creatingFromDeckRef.current = true;
      const id = newConversation(globalAIProfileState);
      setDeck(deckIdFromSearch);
      setActiveConversationId(id);
      navigate({ search: { conversationId: id }, replace: true });
      return;
    }
    const stored = getActiveConversationId();
    if (stored) navigate({ search: { conversationId: stored }, replace: true });
  }, [conversationId, deckIdFromSearch, navigate, newConversation, setDeck, globalAIProfileState]);

  const handleConversationIdChange = useCallback(
    (id: string) => {
      setActiveConversationId(id);
      navigate({ search: { conversationId: id }, replace: true });
    },
    [navigate],
  );

  const handleActiveConversationDeleted = useCallback(() => {
    clearActiveConversationId();
    const id = newConversation(globalAIProfileState);
    setActiveConversationId(id);
    navigate({ search: { conversationId: id }, replace: true });
  }, [navigate, newConversation, globalAIProfileState]);

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
        <AssistantNewConversationButton onConversationIdChange={handleConversationIdChange} />
        <AssistantConversationsList activeId={conversationId} onActiveDeleted={handleActiveConversationDeleted} />
      </Layout.Sidebar>
      <Layout.Content isAlwaysVisible>
        <Layout.Header>
          <div className="flex flex-row flex-wrap items-center w-full max-w-3xl mx-auto">
            <Layout.H1 variants={{ class: title ? "" : "fg-disabled" }}>
              {title || _(CONVERSATION_TITLE_FALLBACK)}
            </Layout.H1>
            {conversationId && (
              <div className="flex flex-row items-center gap-1 px-2">
                <ConversationHeaderMenu conversationId={conversationId} onClone={handleConversationIdChange} />
              </div>
            )}
          </div>
        </Layout.Header>
        <Layout.Container ref={ref} tabIndex={-1}>
          <AssistantChat
            conversationId={conversationId}
            onConversationIdChange={handleConversationIdChange}
            onActiveDeleted={handleActiveConversationDeleted}
            onPrevConversation={handlePrevConversation}
            onNextConversation={handleNextConversation}
            renderAddProfileDialog={(props) => <SettingsAIAddProfile trigger="none" {...props} />}
          />
        </Layout.Container>
      </Layout.Content>
    </>
  );
}
