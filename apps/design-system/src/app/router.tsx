import { NotFound } from "@koloda/ui";
import { createRootRoute, createRoute, createRouter } from "@tanstack/react-router";
import { Shell } from "../components/shell";
import { AlgorithmPage } from "../pages/algorithm-page";
import { AlgorithmsPage } from "../pages/algorithms-page";
import { AssistantPage } from "../pages/assistant-page";
import { DashboardPage } from "../pages/dashboard-page";
import { DeckPage } from "../pages/deck-page";
import { DecksPage } from "../pages/decks-page";
import { TemplatePage } from "../pages/template-page";
import { TemplatesPage } from "../pages/templates-page";

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

const decksRoute = createRoute({ getParentRoute: () => rootRoute, path: "/decks", component: DecksPage });

const deckRoute = createRoute({ getParentRoute: () => decksRoute, path: "$deckId", component: DeckPage });

const algorithmsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/algorithms",
  component: AlgorithmsPage,
});

const algorithmRoute = createRoute({
  getParentRoute: () => algorithmsRoute,
  path: "$algorithmId",
  component: AlgorithmPage,
});

const templatesRoute = createRoute({ getParentRoute: () => rootRoute, path: "/templates", component: TemplatesPage });

const templateRoute = createRoute({
  getParentRoute: () => templatesRoute,
  path: "$templateId",
  component: TemplatePage,
});

export const router = createRouter({
  routeTree: rootRoute.addChildren([
    dashboardRoute,
    decksRoute.addChildren([deckRoute]),
    algorithmsRoute.addChildren([algorithmRoute]),
    templatesRoute.addChildren([templateRoute]),
    assistantRoute,
  ]),
  defaultNotFoundComponent: NotFound,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
