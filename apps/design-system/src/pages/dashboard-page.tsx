import { LearnedToday, Lessons } from "@koloda/srs-react";
import { Layout } from "@koloda/ui";
import { LessonModal } from "../components/lesson-modal";

export function DashboardPage() {
  return (
    <>
      <Layout.Sidebar>
        <LearnedToday />
      </Layout.Sidebar>
      <Layout.Content isAlwaysVisible>
        <Layout.Container>
          <Lessons lesson={<LessonModal />} />
        </Layout.Container>
      </Layout.Content>
    </>
  );
}
