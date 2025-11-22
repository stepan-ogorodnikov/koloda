import { Algorithm, useTitle } from "@koloda/react";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_/algorithms/$algorithmId")({
  component: AlgorithmRoute,
  loader: ({ context: { queryClient, queries }, params: { algorithmId } }) => {
    const { getAlgorithmQuery } = queries;
    queryClient.ensureQueryData({ queryKey: ["algorithms", algorithmId], ...getAlgorithmQuery(algorithmId) });
  },
});

function AlgorithmRoute() {
  useTitle();
  const { algorithmId } = Route.useParams();

  return <Algorithm id={algorithmId} key={algorithmId} />;
}
