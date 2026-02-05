import { Algorithm, algorithmsQueryKeys, NotFound, queriesAtom, QueryState } from "@koloda/react";
import { BackButton, Main } from "@koloda/ui";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useCanGoBack, useRouter } from "@tanstack/react-router";
import { useAtomValue } from "jotai";

export const Route = createFileRoute("/_/algorithms/$algorithmId")({
  component: AlgorithmRoute,
  loader: ({ context: { queryClient, queries }, params: { algorithmId } }) => {
    const id = Number(algorithmId);
    const { getAlgorithmQuery } = queries;
    queryClient.ensureQueryData({ queryKey: algorithmsQueryKeys.detail(id), ...getAlgorithmQuery(id) });
  },
});

function AlgorithmRoute() {
  const { algorithmId } = Route.useParams();
  const id = Number(algorithmId);
  const router = useRouter();
  const canGoBack = useCanGoBack();
  const { getAlgorithmQuery } = useAtomValue(queriesAtom);
  const query = useQuery({ queryKey: algorithmsQueryKeys.detail(id), ...getAlgorithmQuery(id) });

  if ((query.isSuccess && query.data === null) || isNaN(id)) return <NotFound />;

  return (
    <>
      <Main.Titlebar>
        {canGoBack && <BackButton onClick={() => router.navigate({ to: "/algorithms" })} />}
        <Main.H1>{query.data?.title}</Main.H1>
      </Main.Titlebar>
      <QueryState query={query}>
        {() => <Algorithm id={id} key={algorithmId} />}
      </QueryState>
    </>
  );
}
