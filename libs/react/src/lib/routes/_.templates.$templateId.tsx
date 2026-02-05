import { NotFound, queriesAtom, QueryState, Template, templatesQueryKeys } from "@koloda/react";
import { BackButton, Main } from "@koloda/ui";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useAtomValue } from "jotai";

export const Route = createFileRoute("/_/templates/$templateId")({
  component: TemplateRoute,
  loader: ({ context: { queryClient, queries }, params: { templateId } }) => {
    const id = Number(templateId);
    const { getTemplateQuery } = queries;
    queryClient.ensureQueryData({ queryKey: templatesQueryKeys.detail(id), ...getTemplateQuery(id) });
  },
});

function TemplateRoute() {
  const { templateId } = Route.useParams();
  const id = Number(templateId);
  const router = useRouter();
  const { getTemplateQuery } = useAtomValue(queriesAtom);
  const query = useQuery({ queryKey: templatesQueryKeys.detail(id), ...getTemplateQuery(id) });

  if ((query.isSuccess && query.data === null) || isNaN(id)) return <NotFound />;

  return (
    <>
      <Main.Titlebar>
        <BackButton onClick={() => router.navigate({ to: "/templates" })} />
        <Main.H1>{query.data?.title}</Main.H1>
      </Main.Titlebar>
      <QueryState query={query}>
        {() => <Template id={id} key={templateId} />}
      </QueryState>
    </>
  );
}
