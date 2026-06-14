import { getActiveConversationId, setActiveConversationId } from "@koloda/app";
import { queryKeys, useTitle } from "@koloda/core-react";
import { AssistantChat, AssistantNewConversationButton, DeckPicker } from "@koloda/srs-react";
import { Layout, useRouteFocus } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect } from "react";

export const Route = createFileRoute("/_/ai")({
  component: AIRoute,
  validateSearch: (search: Record<string, unknown>) => ({
    deckId: search.deckId ? Number(search.deckId) : undefined,
    conversationId: typeof search.conversationId === "string" ? search.conversationId : undefined,
  }),
  loader: ({ context: { queryClient, queries } }) => {
    const { getAIProfilesQuery } = queries;
    queryClient.ensureQueryData({ queryKey: queryKeys.ai.profiles(), ...getAIProfilesQuery() });
    return { title: msg`title.ai` };
  },
});

function AIRoute() {
  useTitle();
  const ref = useRouteFocus();
  const { _ } = useLingui();
  const navigate = Route.useNavigate();
  const { deckId, conversationId } = Route.useSearch();

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

  const handleConversationIdChange = useCallback((id: string) => {
    setActiveConversationId(id);
    navigate({ search: { conversationId: id }, replace: true });
  }, [navigate]);

  const handleDeckChange = useCallback((id: number) => {
    navigate({ search: { deckId: id }, replace: true });
  }, [navigate]);

  return (
    <>
      <Layout.Sidebar>
        <AssistantNewConversationButton onConversationIdChange={handleConversationIdChange} />
      </Layout.Sidebar>
      <Layout.Content isAlwaysVisible>
        <Layout.Header variants={{ class: "justify-center" }}>
          <div className="self-center flex flex-row flex-wrap items-center w-full max-w-3xl px-2">
            <Layout.H1>{_(msg`title.ai`)}</Layout.H1>
            <div className="flex flex-row items-center gap-1 pl-2" id="assistant-deck-picker-container">
              <DeckPicker
                variants={{ class: "flex-row items-center gap-2" }}
                labelVariants={{ class: "fg-level-2 font-medium" }}
                buttonVariants={{ class: "min-w-48 wd:min-w-60" }}
                value={deckId ?? null}
                onChange={handleDeckChange}
                isNullable
              />
            </div>
          </div>
        </Layout.Header>
        <Layout.Container ref={ref} tabIndex={-1}>
          <AssistantChat
            deckId={deckId}
            conversationId={conversationId}
            onConversationIdChange={handleConversationIdChange}
          />
        </Layout.Container>
      </Layout.Content>
    </>
  );
}
