import { NotFound } from "@koloda/ui";
import { createRootRoute, createRoute, createRouter } from "@tanstack/react-router";
import { Shell } from "../components/shell";
import { AssistantPage } from "../pages/assistant-page";
import { DashboardPage } from "../pages/dashboard-page";

const rootRoute = createRootRoute({ component: Shell });

const dashboardRoute = createRoute({ getParentRoute: () => rootRoute, path: "/", component: DashboardPage });

const assistantRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/ai",
  component: AssistantPage,
  validateSearch: (search: Record<string, unknown>) => ({
    conversationId: typeof search.conversationId === "string" ? search.conversationId : undefined,
  }),
});

export const router = createRouter({
  routeTree: rootRoute.addChildren([dashboardRoute, assistantRoute]),
  defaultNotFoundComponent: NotFound,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
