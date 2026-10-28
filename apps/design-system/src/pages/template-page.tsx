import { queriesAtom } from "@koloda/core-react";
import { Template } from "@koloda/srs-react";
import { Layout, NotFound, QueryState, useLayoutHeaderScrollShadow, useRouteFocus } from "@koloda/ui";
import { useQuery } from "@tanstack/react-query";
import { getRouteApi } from "@tanstack/react-router";
import { useAtomValue } from "jotai";

const templateRoute = getRouteApi("/templates/$templateId");

export function TemplatePage() {
  const { templateId } = templateRoute.useParams();
  const ref = useRouteFocus(templateId);
  useLayoutHeaderScrollShadow(ref);
  const { getTemplateQuery } = useAtomValue(queriesAtom);
  const query = useQuery(getTemplateQuery(templateId));

  if (query.isSuccess && query.data === null) return <NotFound />;

  return (
    <>
      <Layout.Header>
        <Layout.H1>{query.data?.title}</Layout.H1>
      </Layout.Header>
      <Layout.Container ref={ref} tabIndex={-1}>
        <QueryState query={query}>{() => <Template id={templateId} key={templateId} />}</QueryState>
      </Layout.Container>
    </>
  );
}
