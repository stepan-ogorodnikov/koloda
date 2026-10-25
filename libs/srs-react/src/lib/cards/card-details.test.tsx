import { AppError } from "@koloda/app";
import { langAtom, queriesAtom, queryKeys } from "@koloda/core-react";
import type { Queries } from "@koloda/core-react";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { createStore, Provider as JotaiProvider } from "jotai";
import type { PropsWithChildren } from "react";
import { describe, expect, it, vi } from "vitest";
import { createCard, createQueryClient, createTemplate } from "../../test/test-helpers";
import { CardDetails } from "./card-details";

// WHY: the form timestamps use the `Trans` macro, which the test config does not compile.
vi.mock("@lingui/react/macro", () => ({ Trans: ({ children }: PropsWithChildren) => <>{children}</> }));

i18n.loadAndActivate({ locale: "en", messages: {} });

describe("CardDetails", () => {
  it("shows why a progress reset failed", async () => {
    const template = createTemplate();
    const card = createCard({ templateId: template.id, state: 2, dueAt: new Date("2030-01-01T00:00:00.000Z") });
    const queries = {
      getTemplateQuery: (id: string) => ({ queryKey: queryKeys.templates.detail(id), queryFn: async () => template }),
      getSettingsQuery: (name: "hotkeys") => ({ queryKey: queryKeys.settings.detail(name), queryFn: async () => null }),
      getReviewsQuery: (data: { cardId: string }) => ({
        queryKey: queryKeys.reviews.card(data),
        queryFn: async () => [],
      }),
      updateCardMutation: () => ({ mutationFn: async () => undefined }),
      resetCardProgressMutation: () => ({
        mutationFn: async () => {
          throw new AppError("not-found.cards.reset.card");
        },
      }),
      deleteCardMutation: () => ({ mutationFn: async () => undefined }),
      addAttachmentMutation: () => ({ mutationFn: async () => null }),
    } as unknown as Queries;
    const store = createStore();
    store.set(queriesAtom, queries);
    store.set(langAtom, "en");

    render(
      <I18nProvider i18n={i18n}>
        <QueryClientProvider client={createQueryClient()}>
          <JotaiProvider store={store}>
            <CardDetails card={card} />
          </JotaiProvider>
        </QueryClientProvider>
      </I18nProvider>,
    );
    fireEvent.click(await screen.findByRole("button", { name: "card.action.reset-progress" }));

    expect(await screen.findByText("not-found.cards.reset.card")).toBeTruthy();
  });
});
