import { queriesAtom } from "@koloda/core-react";
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
    const { getAlgorithmQuery } = queries;
    queryClient.ensureQueryData(getAlgorithmQuery(algorithmId));
  },
});

function AlgorithmRoute() {
  const { algorithmId } = Route.useParams();
  const ref = useRouteFocus(algorithmId);
  useLayoutHeaderScrollShadow(ref);
  const id = algorithmId;
  const { getAlgorithmQuery } = useAtomValue(queriesAtom);
  const query = useQuery(getAlgorithmQuery(id));

  if (query.isSuccess && query.data === null) return <NotFound />;

  return (
    <>
      <Layout.Header>
        <Layout.H1>{query.data?.title}</Layout.H1>
      </Layout.Header>
      <Layout.Container ref={ref} tabIndex={-1}>
        <QueryState query={query}>{() => <Algorithm id={id} key={algorithmId} />}</QueryState>
      </Layout.Container>
    </>
  );
}
