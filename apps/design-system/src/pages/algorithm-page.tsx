import { queriesAtom } from "@koloda/core-react";
import { Algorithm } from "@koloda/srs-react";
import { Layout, NotFound, QueryState, useLayoutHeaderScrollShadow, useRouteFocus } from "@koloda/ui";
import { useQuery } from "@tanstack/react-query";
import { getRouteApi } from "@tanstack/react-router";
import { useAtomValue } from "jotai";

const algorithmRoute = getRouteApi("/algorithms/$algorithmId");

export function AlgorithmPage() {
  const { algorithmId } = algorithmRoute.useParams();
  const ref = useRouteFocus(algorithmId);
  useLayoutHeaderScrollShadow(ref);
  const { getAlgorithmQuery } = useAtomValue(queriesAtom);
  const query = useQuery(getAlgorithmQuery(algorithmId));

  if (query.isSuccess && query.data === null) return <NotFound />;

  return (
    <>
      <Layout.Header>
        <Layout.H1>{query.data?.title}</Layout.H1>
      </Layout.Header>
      <Layout.Container ref={ref} tabIndex={-1}>
        <QueryState query={query}>{() => <Algorithm id={algorithmId} key={algorithmId} />}</QueryState>
      </Layout.Container>
    </>
  );
}
