import { aiQueryKeys, queriesAtom, QueryState, SettingsAi, useTitle } from "@koloda/react";
import { BackButton, Main } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useCanGoBack, useRouter } from "@tanstack/react-router";
import { useAtomValue } from "jotai";

export const Route = createFileRoute("/_/settings/ai")({
  component: SettingsAiRoute,
  loader: ({ context: { queryClient, queries } }) => {
    const { getAIProfilesQuery } = queries;
    queryClient.ensureQueryData({ queryKey: aiQueryKeys.profiles(), ...getAIProfilesQuery() });
    return { title: msg`title.settings.ai` };
  },
});

function SettingsAiRoute() {
  useTitle();
  const { _ } = useLingui();
  const router = useRouter();
  const canGoBack = useCanGoBack();
  const { getAIProfilesQuery } = useAtomValue(queriesAtom);
  const query = useQuery({ ...getAIProfilesQuery(), queryKey: aiQueryKeys.profiles() });

  return (
    <>
      <Main.Titlebar>
        {canGoBack && <BackButton onClick={() => router.history.back()} />}
        <Main.H1>{_(msg`settings.ai`)}</Main.H1>
      </Main.Titlebar>
      <QueryState query={query}>
        {(data) => <SettingsAi data={data || []} />}
      </QueryState>
    </>
  );
}
