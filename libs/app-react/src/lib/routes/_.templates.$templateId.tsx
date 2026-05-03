import { queriesAtom, queryKeys } from "@koloda/core-react";
import { Template } from "@koloda/srs-react";
import { NotFound } from "@koloda/ui";
import { QueryState } from "@koloda/ui";
import { BackButton, Main, useRouteFocus } from "@koloda/ui";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useRouter } from "@tanstack/react-router";
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
  const id = Number(templateId);
  const router = useRouter();
  const { getTemplateQuery } = useAtomValue(queriesAtom);
  const query = useQuery({ queryKey: queryKeys.templates.detail(id), ...getTemplateQuery(id) });

  if ((query.isSuccess && query.data === null) || isNaN(id)) return <NotFound />;

  return (
    <Main.Container ref={ref} tabIndex={-1}>
      <Main.Titlebar>
        <BackButton onClick={() => router.navigate({ to: "/templates" })} />
        <Main.H1>{query.data?.title}</Main.H1>
      </Main.Titlebar>
      <QueryState query={query}>
        {() => <Template id={id} key={templateId} />}
      </QueryState>
    </Main.Container>
  );
}
