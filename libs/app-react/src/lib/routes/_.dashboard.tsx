import { queryKeys, useTitle } from "@koloda/core-react";
import { LearnedToday } from "@koloda/srs-react";
import { Lessons } from "@koloda/srs-react";
import { Main, useRouteFocus } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_/dashboard")({
  component: DashboardRoute,
  loader: ({ context: { queryClient, queries } }) => {
    const { getLessonsQuery } = queries;
    queryClient.ensureQueryData({ queryKey: queryKeys.lessons.all(), ...getLessonsQuery() });
    return { title: msg`title.dashboard` };
  },
});

function DashboardRoute() {
  useTitle();
  const ref = useRouteFocus();

  return (
    <Main.Container
      variants={{ class: "tb:flex-row items-start gap-4 tb:p-4" }}
      ref={ref}
      tabIndex={-1}
    >
      <Lessons />
      <LearnedToday />
    </Main.Container>
  );
}
