import { QueryError, QueryLoading } from "@koloda/react";
import { Fade } from "@koloda/ui";
import type { UseQueryResult } from "@tanstack/react-query";
import { AnimatePresence } from "motion/react";
import type { ReactNode } from "react";

type QueryStateProps<TData> = {
  query: Pick<UseQueryResult<TData>, "data" | "error" | "isLoading" | "refetch">;
  children: (data: NonNullable<TData>) => ReactNode;
};

export function QueryState<TData>({ query, children }: QueryStateProps<TData>) {
  const { data, error, isLoading, refetch } = query;

  return (
    <AnimatePresence mode="wait">
      {error && (
        <Fade key="error">
          <QueryError error={error} onRetry={refetch} />
        </Fade>
      )}
      {isLoading && !error && (
        <Fade key="loading">
          <QueryLoading />
        </Fade>
      )}
      {!isLoading && !error && data && (
        <Fade key="data">
          {children(data as NonNullable<TData>)}
        </Fade>
      )}
    </AnimatePresence>
  );
}
