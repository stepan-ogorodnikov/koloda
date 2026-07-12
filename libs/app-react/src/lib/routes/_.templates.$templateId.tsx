import { queriesAtom, queryKeys } from "@koloda/core-react";
import { Template } from "@koloda/srs-react";
import { NotFound, useLayoutHeaderScrollShadow } from "@koloda/ui";
import { QueryState } from "@koloda/ui";
import { Layout, useRouteFocus } from "@koloda/ui";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useAtomValue } from "jotai";

export const Route = createFileRoute("/_/templates/$templateId")({
  component: TemplateRoute,
  loader: ({ context: { queryClient, queries }, params: { templateId } }) => {
    const id = Number(templateId);
    const { getTemplateQuery } = queries;
    queryClient.ensureQueryData({ queryKey: queryKeys.templates.detail(id), ...getTemplateQuery(id) });
  },
});

function TemplateRoute() {
  const { templateId } = Route.useParams();
  const ref = useRouteFocus(templateId);
  useLayoutHeaderScrollShadow(ref);
  const id = Number(templateId);
  const { getTemplateQuery } = useAtomValue(queriesAtom);
  const query = useQuery({ queryKey: queryKeys.templates.detail(id), ...getTemplateQuery(id) });

  if ((query.isSuccess && query.data === null) || isNaN(id)) return <NotFound />;

  return (
    <>
      <Layout.Header>
        <Layout.H1>{query.data?.title}</Layout.H1>
      </Layout.Header>
      <Layout.Container ref={ref} tabIndex={-1}>
        <QueryState query={query}>{() => <Template id={id} key={templateId} />}</QueryState>
      </Layout.Container>
    </>
  );
}
