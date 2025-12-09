import { queriesAtom, Template } from "@koloda/react";
import { BackButton, Main } from "@koloda/ui";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useAtomValue } from "jotai";

export const Route = createFileRoute("/_/templates/$templateId")({
  component: TemplateRoute,
  loader: ({ context: { queryClient, queries }, params: { templateId } }) => {
    const { getTemplateQuery } = queries;
    queryClient.ensureQueryData({ queryKey: ["templates", templateId], ...getTemplateQuery(templateId) });
  },
});

function TemplateRoute() {
  const { templateId } = Route.useParams();
  const router = useRouter();
  const { getTemplateQuery } = useAtomValue(queriesAtom);
  const { data } = useQuery({ queryKey: ["templates", templateId], ...getTemplateQuery(templateId) });

  return (
    <>
      <Main.Titlebar>
        <BackButton onClick={() => router.navigate({ to: "/templates" })} />
        <Main.H1>{data?.title}</Main.H1>
      </Main.Titlebar>
      <Template id={templateId} key={templateId} />
    </>
  );
}
