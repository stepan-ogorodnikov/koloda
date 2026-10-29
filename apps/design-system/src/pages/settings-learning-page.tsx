import { DEFAULT_LEARNING_SETTINGS, learningSettingsValidation } from "@koloda/app";
import { queriesAtom } from "@koloda/core-react";
import { SettingsLearning } from "@koloda/settings-react";
import { Layout, QueryState, useLayoutHeaderScrollShadow, useRouteFocus } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useQuery } from "@tanstack/react-query";
import { useAtomValue } from "jotai";

export function SettingsLearningPage() {
  const { _ } = useLingui();
  const ref = useRouteFocus();
  useLayoutHeaderScrollShadow(ref);
  const { getSettingsQuery } = useAtomValue(queriesAtom);
  const query = useQuery(getSettingsQuery("learning"));

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
