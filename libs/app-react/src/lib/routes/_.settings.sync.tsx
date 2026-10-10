import { syncQueriesAtom, useTitle } from "@koloda/core-react";
import type { SyncQueries } from "@koloda/core-react";
import { Layout, NotFound, QueryState, useLayoutHeaderScrollShadow, useRouteFocus } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useAtomValue } from "jotai";
import { SettingsSync } from "@koloda/settings-react";

export const Route = createFileRoute("/_/settings/sync")({
  component: SettingsSyncRoute,
  loader: () => ({ title: msg`title.settings.sync` }),
});

// INVARIANT: only a host that syncs provides `syncQueriesAtom`; on the web this route does not exist.
function SettingsSyncRoute() {
  const sync = useAtomValue(syncQueriesAtom);
  if (!sync) return <NotFound />;
  return <SettingsSyncPage sync={sync} />;
}

type SettingsSyncPageProps = { sync: SyncQueries };

function SettingsSyncPage({ sync }: SettingsSyncPageProps) {
  useTitle();
  const { _ } = useLingui();
  const ref = useRouteFocus();
  useLayoutHeaderScrollShadow(ref);
  const query = useQuery(sync.getStatusQuery());

  return (
    <>
      <Layout.Header>
        <Layout.H1>{_(msg`settings.sync`)}</Layout.H1>
      </Layout.Header>
      <Layout.Container ref={ref} tabIndex={-1}>
        <QueryState query={query}>{(status) => <SettingsSync status={status} sync={sync} />}</QueryState>
      </Layout.Container>
    </>
  );
}
