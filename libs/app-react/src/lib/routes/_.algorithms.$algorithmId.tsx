import { queriesAtom, queryKeys } from "@koloda/core-react";
import { Algorithm } from "@koloda/srs-react";
import { NotFound, useLayoutHeaderScrollShadow } from "@koloda/ui";
import { QueryState } from "@koloda/ui";
import { Layout, useRouteFocus } from "@koloda/ui";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useAtomValue } from "jotai";

export const Route = createFileRoute("/_/algorithms/$algorithmId")({
  component: AlgorithmRoute,
  loader: ({ context: { queryClient, queries }, params: { algorithmId } }) => {
    const id = Number(algorithmId);
    const { getAlgorithmQuery } = queries;
    queryClient.ensureQueryData({ queryKey: queryKeys.algorithms.detail(id), ...getAlgorithmQuery(id) });
  },
});

function AlgorithmRoute() {
  const { algorithmId } = Route.useParams();
  const ref = useRouteFocus(algorithmId);
  useLayoutHeaderScrollShadow(ref);
  const id = Number(algorithmId);
  const { getAlgorithmQuery } = useAtomValue(queriesAtom);
  const query = useQuery({ queryKey: queryKeys.algorithms.detail(id), ...getAlgorithmQuery(id) });

  if ((query.isSuccess && query.data === null) || isNaN(id)) return <NotFound />;

  return (
    <>
      <Layout.Header>
        <Layout.H1>{query.data?.title}</Layout.H1>
      </Layout.Header>
      <Layout.Container ref={ref} tabIndex={-1}>
        <QueryState query={query}>
          {() => <Algorithm id={id} key={algorithmId} />}
        </QueryState>
      </Layout.Container>
    </>
  );
}
