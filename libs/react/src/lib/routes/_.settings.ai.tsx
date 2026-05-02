import { QueryState } from "../components/query-state";
import { SettingsAi } from "../settings/settings-ai";
import { queriesAtom, queryKeys, useTitle } from "@koloda/react-base";
import { BackButton, Main, useRouteFocus } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useCanGoBack, useRouter } from "@tanstack/react-router";
import { useAtomValue } from "jotai";

export const Route = createFileRoute("/_/settings/ai")({
  component: SettingsAiRoute,
  loader: ({ context: { queryClient, queries } }) => {
    const { getAIProfilesQuery } = queries;
    queryClient.ensureQueryData({ queryKey: queryKeys.ai.profiles(), ...getAIProfilesQuery() });
    return { title: msg`title.settings.ai` };
  },
});

function SettingsAiRoute() {
  useTitle();
  const ref = useRouteFocus();
  const { _ } = useLingui();
  const router = useRouter();
  const canGoBack = useCanGoBack();
  const { getAIProfilesQuery } = useAtomValue(queriesAtom);
  const query = useQuery({ ...getAIProfilesQuery(), queryKey: queryKeys.ai.profiles() });

  return (
    <>
      <Main.Titlebar>
        {canGoBack && <BackButton onClick={() => router.history.back()} />}
        <Main.H1>{_(msg`settings.ai`)}</Main.H1>
      </Main.Titlebar>
      <Main.Container ref={ref} tabIndex={-1}>
        <QueryState query={query}>
          {(data) => <SettingsAi data={data || []} />}
        </QueryState>
      </Main.Container>
    </>
  );
}
