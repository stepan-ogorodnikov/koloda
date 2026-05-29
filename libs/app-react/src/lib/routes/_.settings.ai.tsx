import { queriesAtom, queryKeys, useTitle } from "@koloda/core-react";
import { QueryState } from "@koloda/ui";
import { Layout, useRouteFocus } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useAtomValue } from "jotai";
import { SettingsAi } from "../settings/settings-ai";

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
  const { getAIProfilesQuery } = useAtomValue(queriesAtom);
  const query = useQuery({ ...getAIProfilesQuery(), queryKey: queryKeys.ai.profiles() });

  return (
    <>
      <Layout.Header>
        <Layout.H1>{_(msg`settings.ai`)}</Layout.H1>
      </Layout.Header>
      <Layout.Container ref={ref} tabIndex={-1}>
        <QueryState query={query}>
          {(data) => <SettingsAi data={data || []} />}
        </QueryState>
      </Layout.Container>
    </>
  );
}
