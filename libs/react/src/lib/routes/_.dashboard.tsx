import { LearnedToday, Lessons, lessonsQueryKeys, useTitle } from "@koloda/react";
import { Main } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_/dashboard")({
  component: DashboardRoute,
  loader: ({ context: { queryClient, queries } }) => {
    const { getLessonsQuery } = queries;
    queryClient.ensureQueryData({ queryKey: lessonsQueryKeys.all(), ...getLessonsQuery() });
    return { title: msg`title.dashboard` };
  },
});

function DashboardRoute() {
  useTitle();

  return (
    <Main.Container variants={{ class: "tb:flex-row items-start gap-4 tb:p-4" }}>
      <Lessons />
      <LearnedToday />
    </Main.Container>
  );
}
