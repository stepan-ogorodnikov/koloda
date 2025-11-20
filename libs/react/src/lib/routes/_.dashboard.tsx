import { LearnedToday, Lessons } from "@koloda/react";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_/dashboard")({
  component: DashboardRoute,
  loader: ({ context: { queryClient, queries } }) => {
    const { getLessonsQuery } = queries;
    queryClient.ensureQueryData({ queryKey: ["lessons"], ...getLessonsQuery({}) });
  },
});

function DashboardRoute() {
  return (
    <div>
      <LearnedToday />
      <Lessons />
    </div>
  );
}
