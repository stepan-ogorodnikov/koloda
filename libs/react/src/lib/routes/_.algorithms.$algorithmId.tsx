import { Algorithm, algorithmQueryKeys, queriesAtom } from "@koloda/react";
import { BackButton, Main } from "@koloda/ui";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useCanGoBack, useRouter } from "@tanstack/react-router";
import { useAtomValue } from "jotai";

export const Route = createFileRoute("/_/algorithms/$algorithmId")({
  component: AlgorithmRoute,
  loader: ({ context: { queryClient, queries }, params: { algorithmId } }) => {
    const { getAlgorithmQuery } = queries;
    queryClient.ensureQueryData({ queryKey: algorithmQueryKeys.detail(algorithmId), ...getAlgorithmQuery(algorithmId) });
  },
});

function AlgorithmRoute() {
  const { algorithmId } = Route.useParams();
  const router = useRouter();
  const canGoBack = useCanGoBack();
  const { getAlgorithmQuery } = useAtomValue(queriesAtom);
  const { data } = useQuery({ queryKey: algorithmQueryKeys.detail(algorithmId), ...getAlgorithmQuery(algorithmId) });

  return (
    <>
      <Main.Titlebar>
        {canGoBack && <BackButton onClick={() => router.navigate({ to: "/algorithms" })} />}
        <Main.H1>{data?.title}</Main.H1>
      </Main.Titlebar>
      <Algorithm id={algorithmId} key={algorithmId} />
    </>
  );
}
