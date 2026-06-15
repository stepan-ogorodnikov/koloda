import { Cancel01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { getActiveConversationId, setActiveConversationId } from "@koloda/app";
import { queryKeys, useTitle } from "@koloda/core-react";
import {
  AssistantChat,
  assistantDeckIdAtom,
  assistantIsLockedAtom,
  AssistantNewConversationButton,
  DeckPicker,
  newConversationAtom,
  setAssistantDeckAtom,
} from "@koloda/srs-react";
import { Button, Layout, Tooltip, useRouteFocus } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { createFileRoute } from "@tanstack/react-router";
import { useAtomValue, useSetAtom } from "jotai";
import { useCallback, useEffect, useRef } from "react";

export const Route = createFileRoute("/_/ai")({
  component: AIRoute,
  validateSearch: (search: Record<string, unknown>) => ({
    conversationId: typeof search.conversationId === "string" ? search.conversationId : undefined,
    deckId: typeof search.deckId === "string" || typeof search.deckId === "number"
      ? Number(search.deckId)
      : undefined,
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
  const { conversationId, deckId: deckIdFromSearch } = Route.useSearch();
  const deckId = useAtomValue(assistantDeckIdAtom);
  const isLocked = useAtomValue(assistantIsLockedAtom);
  const setDeck = useSetAtom(setAssistantDeckAtom);
  const newConversation = useSetAtom(newConversationAtom);
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
      const id = newConversation();
      setDeck(deckIdFromSearch);
      setActiveConversationId(id);
      navigate({ search: { conversationId: id }, replace: true });
      return;
    }
    const stored = getActiveConversationId();
    if (stored) {
      navigate({ search: { conversationId: stored }, replace: true });
    }
  }, [conversationId, deckIdFromSearch, navigate, newConversation, setDeck]);

  const handleConversationIdChange = useCallback((id: string) => {
    setActiveConversationId(id);
    navigate({ search: { conversationId: id }, replace: true });
  }, [navigate]);

  const handleClearDeck = useCallback(() => {
    setDeck(null);
  }, [setDeck]);

  return (
    <>
      <Layout.Sidebar>
        <AssistantNewConversationButton onConversationIdChange={handleConversationIdChange} />
      </Layout.Sidebar>
      <Layout.Content isAlwaysVisible>
        <Layout.Header variants={{ class: "justify-center" }}>
          <div className="self-center flex flex-row flex-wrap items-center w-full max-w-3xl px-2">
            <Layout.H1>{_(msg`title.ai`)}</Layout.H1>
            <div className="flex flex-row items-center gap-1 pl-2">
              <DeckPicker
                variants={{ class: "flex-row items-center gap-2" }}
                labelVariants={{ class: "fg-level-2 font-medium" }}
                buttonVariants={{ class: "min-w-48 wd:min-w-60" }}
                value={deckId}
                onChange={setDeck}
                isNullable
                isDisabled={isLocked}
              />
              <Tooltip content={_(msg`ai.deck-picker.clear`)} isDisabled={!deckId || isLocked}>
                <Button
                  variants={{ style: "ghost", size: "smallIcon" }}
                  aria-label={_(msg`ai.deck-picker.clear`)}
                  isDisabled={!deckId || isLocked}
                  onPress={handleClearDeck}
                >
                  <HugeiconsIcon className="size-5 min-w-5" strokeWidth={1.75} icon={Cancel01Icon} aria-hidden="true" />
                </Button>
              </Tooltip>
            </div>
          </div>
        </Layout.Header>
        <Layout.Container ref={ref} tabIndex={-1}>
          <AssistantChat
            conversationId={conversationId}
            onConversationIdChange={handleConversationIdChange}
          />
        </Layout.Container>
      </Layout.Content>
    </>
  );
}
