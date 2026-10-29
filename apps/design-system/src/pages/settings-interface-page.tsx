import { SettingsInterface } from "@koloda/settings-react";
import { Layout, useLayoutHeaderScrollShadow, useRouteFocus } from "@koloda/ui";

export function SettingsInterfacePage() {
  const ref = useRouteFocus();
  useLayoutHeaderScrollShadow(ref);

  return (
    <>
      <Layout.Header>
        <Layout.H1>Interface</Layout.H1>
      </Layout.Header>
      <Layout.Container ref={ref} tabIndex={-1}>
        <SettingsInterface />
      </Layout.Container>
    </>
  );
}
