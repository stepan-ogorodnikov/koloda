import { Cancel01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { queryKeys, useTitle } from "@koloda/core-react";
import { AssistantChat, AssistantNewConversationButton, DeckPicker } from "@koloda/srs-react";
import { Button, Layout, Tooltip, useRouteFocus } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { createFileRoute } from "@tanstack/react-router";
import { useCallback } from "react";

export const Route = createFileRoute("/_/ai")({
  component: AIRoute,
  validateSearch: (search: Record<string, unknown>) => ({
    deckId: search.deckId ? Number(search.deckId) : undefined,
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
  const { deckId } = Route.useSearch();

  const handleDeckChange = useCallback((id: number) => {
    navigate({ search: { deckId: id }, replace: true });
  }, [navigate]);

  const handleClearDeck = useCallback(() => {
    navigate({ search: {}, replace: true });
  }, [navigate]);

  return (
    <>
      <Layout.Sidebar>
        <AssistantNewConversationButton />
      </Layout.Sidebar>
      <Layout.Content isAlwaysVisible>
        <Layout.Header variants={{ class: "justify-center" }}>
          <div className="flex flex-row flex-wrap items-center w-full max-w-3xl">
            <Layout.H1>{_(msg`title.ai`)}</Layout.H1>
            <div className="flex flex-row items-center gap-1 pl-2">
              <DeckPicker
                variants={{ class: "flex-row items-center gap-2" }}
                labelVariants={{ class: "fg-level-2 font-medium" }}
                buttonVariants={{ class: "min-w-48 wd:min-w-60" }}
                value={deckId ?? null}
                onChange={handleDeckChange}
                isNullable
              />
              <Tooltip content={_(msg`ai.deck-picker.clear`)} isDisabled={!deckId}>
                <Button
                  variants={{ style: "ghost", size: "smallIcon" }}
                  aria-label={_(msg`ai.deck-picker.clear`)}
                  isDisabled={!deckId}
                  onPress={handleClearDeck}
                >
                  <HugeiconsIcon className="size-5 min-w-5" strokeWidth={1.75} icon={Cancel01Icon} aria-hidden="true" />
                </Button>
              </Tooltip>
            </div>
          </div>
        </Layout.Header>
        <Layout.Container ref={ref} tabIndex={-1}>
          <AssistantChat deckId={deckId} />
        </Layout.Container>
      </Layout.Content>
    </>
  );
}
