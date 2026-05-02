import { QueryState } from "../components/query-state";
import { queriesAtom, queryKeys, useTitle } from "@koloda/react-base";
import { DEFAULT_HOTKEYS_SETTINGS } from "@koloda/srs";
import { BackButton, Main, useRouteFocus } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useCanGoBack, useRouter } from "@tanstack/react-router";
import { useAtomValue } from "jotai";
import { SettingsHotkeys } from "../settings/settings-hotkeys";

export const Route = createFileRoute("/_/settings/hotkeys")({
  component: SettingsHotkeysRoute,
  loader: ({ context: { queryClient, queries } }) => {
    const { getSettingsQuery } = queries;
    queryClient.ensureQueryData({ queryKey: queryKeys.settings.detail("hotkeys"), ...getSettingsQuery("hotkeys") });
    return { title: msg`title.settings.hotkeys` };
  },
});

function SettingsHotkeysRoute() {
  useTitle();
  const ref = useRouteFocus();
  const { _ } = useLingui();
  const router = useRouter();
  const canGoBack = useCanGoBack();
  const { getSettingsQuery } = useAtomValue(queriesAtom);
  const query = useQuery({
    ...getSettingsQuery<"hotkeys">("hotkeys"),
    queryKey: queryKeys.settings.detail("hotkeys"),
  });

  return (
    <>
      <Main.Titlebar>
        {canGoBack && <BackButton onClick={() => router.history.back()} />}
        <Main.H1>{_(msg`settings.hotkeys`)}</Main.H1>
      </Main.Titlebar>
      <Main.Container ref={ref} tabIndex={-1}>
        <QueryState query={query}>
          {(data) => <SettingsHotkeys data={data?.content || DEFAULT_HOTKEYS_SETTINGS} />}
        </QueryState>
      </Main.Container>
    </>
  );
}
