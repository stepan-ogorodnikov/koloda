import { Template } from "@koloda/react";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_/templates/$templateId")({
  component: TemplateRoute,
  loader: ({ context: { queryClient, queries }, params: { templateId } }) => {
    const { getTemplateQuery } = queries;
    queryClient.ensureQueryData({ queryKey: ["templates", templateId], ...getTemplateQuery(templateId) });
  },
});

function TemplateRoute() {
  const { templateId } = Route.useParams();

  return <Template id={templateId} key={templateId} />;
}
