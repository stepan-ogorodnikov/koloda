import { DEFAULT_HOTKEYS_SETTINGS } from "@koloda/app";
import { queriesAtom } from "@koloda/core-react";
import { SettingsHotkeys } from "@koloda/settings-react";
import { Layout, QueryState, useLayoutHeaderScrollShadow, useRouteFocus } from "@koloda/ui";
import { useQuery } from "@tanstack/react-query";
import { useAtomValue } from "jotai";

export function SettingsHotkeysPage() {
  const ref = useRouteFocus();
  useLayoutHeaderScrollShadow(ref);
  const { getSettingsQuery } = useAtomValue(queriesAtom);
  const query = useQuery(getSettingsQuery("hotkeys"));

  return (
    <>
      <Layout.Header>
        <Layout.H1>Hotkeys</Layout.H1>
      </Layout.Header>
      <Layout.Container ref={ref} tabIndex={-1}>
        <QueryState query={query}>
          {(data) => <SettingsHotkeys data={data?.content || DEFAULT_HOTKEYS_SETTINGS} />}
        </QueryState>
      </Layout.Container>
    </>
  );
}
