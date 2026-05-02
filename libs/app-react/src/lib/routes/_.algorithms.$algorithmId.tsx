import { queriesAtom, queryKeys } from "@koloda/react-base";
import { Algorithm } from "@koloda/srs-react";
import { NotFound } from "@koloda/ui";
import { QueryState } from "@koloda/ui";
import { BackButton, Main, useRouteFocus } from "@koloda/ui";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useCanGoBack, useRouter } from "@tanstack/react-router";
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
  const id = Number(algorithmId);
  const router = useRouter();
  const canGoBack = useCanGoBack();
  const { getAlgorithmQuery } = useAtomValue(queriesAtom);
  const query = useQuery({ queryKey: queryKeys.algorithms.detail(id), ...getAlgorithmQuery(id) });

  if ((query.isSuccess && query.data === null) || isNaN(id)) return <NotFound />;

  return (
    <>
      <Main.Titlebar>
        {canGoBack && <BackButton onClick={() => router.navigate({ to: "/algorithms" })} />}
        <Main.H1>{query.data?.title}</Main.H1>
      </Main.Titlebar>
      <Main.Container ref={ref} tabIndex={-1}>
        <QueryState query={query}>
          {() => <Algorithm id={id} key={algorithmId} />}
        </QueryState>
      </Main.Container>
    </>
  );
}
