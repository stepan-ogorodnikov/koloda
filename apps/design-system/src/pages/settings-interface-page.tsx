import { SettingsInterface } from "@koloda/settings-react";
import { Layout, useLayoutHeaderScrollShadow, useRouteFocus } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";

export function SettingsInterfacePage() {
  const { _ } = useLingui();
  const ref = useRouteFocus();
  useLayoutHeaderScrollShadow(ref);

  return (
    <>
      <Layout.Header>
        <Layout.H1>{_(msg`settings.interface`)}</Layout.H1>
      </Layout.Header>
      <Layout.Container ref={ref} tabIndex={-1}>
        <SettingsInterface />
      </Layout.Container>
    </>
  );
}
