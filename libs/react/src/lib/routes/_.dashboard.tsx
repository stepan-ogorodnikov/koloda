import { LearnedToday, Lessons, useTitle } from "@koloda/react";
import { msg } from "@lingui/core/macro";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_/dashboard")({
  component: DashboardRoute,
  loader: ({ context: { queryClient, queries } }) => {
    const { getLessonsQuery } = queries;
    queryClient.ensureQueryData({ queryKey: ["lessons"], ...getLessonsQuery({}) });
    return { title: msg`title.dashboard` };
  },
});

function DashboardRoute() {
  useTitle();

  return (
    <div>
      <LearnedToday />
      <Lessons />
    </div>
  );
}
