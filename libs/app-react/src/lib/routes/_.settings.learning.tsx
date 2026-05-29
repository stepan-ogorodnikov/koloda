import { DEFAULT_LEARNING_SETTINGS, learningSettingsValidation } from "@koloda/app";
import { queriesAtom, queryKeys, useTitle } from "@koloda/core-react";
import { QueryState } from "@koloda/ui";
import { Layout, useRouteFocus } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useAtomValue } from "jotai";
import { SettingsLearning } from "../settings/settings-learning";

export const Route = createFileRoute("/_/settings/learning")({
  component: SettingsLearningRoute,
  loader: ({ context: { queryClient, queries } }) => {
    const { getSettingsQuery } = queries;
    queryClient.ensureQueryData({ queryKey: queryKeys.settings.detail("learning"), ...getSettingsQuery("learning") });
    return { title: msg`title.settings.learning` };
  },
});

function SettingsLearningRoute() {
  useTitle();
  const ref = useRouteFocus();
  const { _ } = useLingui();
  const { getSettingsQuery } = useAtomValue(queriesAtom);
  const query = useQuery({
    ...getSettingsQuery<"learning">("learning"),
    queryKey: queryKeys.settings.detail("learning"),
  });

  return (
    <>
      <Layout.Header>
        <Layout.H1>{_(msg`settings.learning`)}</Layout.H1>
      </Layout.Header>
      <Layout.Container ref={ref} tabIndex={-1}>
        <QueryState query={query}>
          {(data) => (
            <SettingsLearning data={learningSettingsValidation.parse(data?.content || DEFAULT_LEARNING_SETTINGS)} />
          )}
        </QueryState>
      </Layout.Container>
    </>
  );
}
