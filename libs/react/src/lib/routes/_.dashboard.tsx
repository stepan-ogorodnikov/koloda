import { LearnedToday, lessonQueryKeys, Lessons, useTitle } from "@koloda/react";
import { msg } from "@lingui/core/macro";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_/dashboard")({
  component: DashboardRoute,
  loader: ({ context: { queryClient, queries } }) => {
    const { getLessonsQuery } = queries;
    queryClient.ensureQueryData({ queryKey: lessonQueryKeys.all(), ...getLessonsQuery() });
    return { title: msg`title.dashboard` };
  },
});

function DashboardRoute() {
  useTitle();

  return (
    <div className="grow flex flex-col tb:flex-row items-start gap-4 tb:p-4">
      <Lessons />
      <LearnedToday />
    </div>
  );
}
