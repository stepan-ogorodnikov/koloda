import { queryKeys, useTitle } from "@koloda/core-react";
import { LearnedToday, Lessons } from "@koloda/srs-react";
import { Layout, useRouteFocus } from "@koloda/ui";
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
    <>
      <Layout.Sidebar>
        <LearnedToday />
      </Layout.Sidebar>
      <Layout.Content>
        <Layout.Container ref={ref} tabIndex={-1}>
          <Lessons />
        </Layout.Container>
      </Layout.Content>
    </>
  );
}
