import { SettingsLearning, settingsQueryKeys, useTitle } from "@koloda/react";
import { BackButton, Main } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { createFileRoute, useCanGoBack, useRouter } from "@tanstack/react-router";

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

  return (
    <>
      <Main.Titlebar>
        {canGoBack && <BackButton onClick={() => router.history.back()} />}
        <Main.H1>{_(msg`settings.learning`)}</Main.H1>
      </Main.Titlebar>
      <SettingsLearning />
    </>
  );
}
