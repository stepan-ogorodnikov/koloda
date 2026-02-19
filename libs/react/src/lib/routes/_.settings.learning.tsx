import { queriesAtom, QueryState, settingsQueryKeys, useTitle } from "@koloda/react";
import { DEFAULT_LEARNING_SETTINGS } from "@koloda/srs";
import { BackButton, Main } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useCanGoBack, useRouter } from "@tanstack/react-router";
import { useAtomValue } from "jotai";
import { SettingsLearning } from "../settings/settings-learning";

export const Route = createFileRoute("/_/settings/learning")({
  component: SettingsLearningRoute,
  loader: ({ context: { queryClient, queries } }) => {
    const { getSettingsQuery } = queries;
    queryClient.ensureQueryData({ queryKey: settingsQueryKeys.detail("learning"), ...getSettingsQuery("learning") });
    return { title: msg`title.settings.learning` };
  },
});

function SettingsLearningRoute() {
  useTitle();
  const { _ } = useLingui();
  const router = useRouter();
  const canGoBack = useCanGoBack();
  const { getSettingsQuery } = useAtomValue(queriesAtom);
  const query = useQuery({
    ...getSettingsQuery<"learning">("learning"),
    queryKey: settingsQueryKeys.detail("learning"),
  });

  return (
    <>
      <Main.Titlebar>
        {canGoBack && <BackButton onClick={() => router.history.back()} />}
        <Main.H1>{_(msg`settings.learning`)}</Main.H1>
      </Main.Titlebar>
      <QueryState query={query}>
        {(data) => <SettingsLearning data={data?.content || DEFAULT_LEARNING_SETTINGS} />}
      </QueryState>
    </>
  );
}
