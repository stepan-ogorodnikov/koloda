import { queriesAtom, QueryState, settingsQueryKeys, useTitle } from "@koloda/react";
import { DEFAULT_AI_SETTINGS } from "@koloda/srs";
import { BackButton, Main } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useCanGoBack, useRouter } from "@tanstack/react-router";
import { useAtomValue } from "jotai";
import { SettingsAi } from "../settings/settings-ai";

export const Route = createFileRoute("/_/settings/ai")({
  component: SettingsAiRoute,
  loader: ({ context: { queryClient, queries } }) => {
    const { getSettingsQuery } = queries;
    queryClient.ensureQueryData({ queryKey: settingsQueryKeys.detail("ai"), ...getSettingsQuery("ai") });
    return { title: msg`title.settings.ai` };
  },
});

function SettingsAiRoute() {
  useTitle();
  const { _ } = useLingui();
  const router = useRouter();
  const canGoBack = useCanGoBack();
  const { getSettingsQuery } = useAtomValue(queriesAtom);
  const query = useQuery({
    ...getSettingsQuery<"ai">("ai"),
    queryKey: settingsQueryKeys.detail("ai"),
  });

  return (
    <>
      <Main.Titlebar>
        {canGoBack && <BackButton onClick={() => router.history.back()} />}
        <Main.H1>{_(msg`settings.ai`)}</Main.H1>
      </Main.Titlebar>
      <QueryState query={query}>
        {(data) => <SettingsAi data={data?.content || DEFAULT_AI_SETTINGS} />}
      </QueryState>
    </>
  );
}
