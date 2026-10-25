import { queriesAtom, queryKeys } from "@koloda/core-react";
import type { Queries } from "@koloda/core-react";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { act, render } from "@testing-library/react";
import { createStore, Provider as JotaiProvider } from "jotai";
import { describe, expect, it, vi } from "vitest";
import { createLessonsResult, createQueryClient } from "../../test/test-helpers";
import { Lessons } from "./lessons";

// The dialog and the count views do not take part in refreshing the overview query.
vi.mock("./lesson", () => ({ Lesson: () => null }));
vi.mock("./lessons-list", () => ({ LessonsList: () => null }));
vi.mock("./lessons-table", () => ({ LessonsTable: () => null }));

i18n.loadAndActivate({ locale: "en", messages: {} });

describe("Lessons", () => {
  it("refetches the overview counts every minute while mounted", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
    const getLessons = vi.fn(async () => createLessonsResult());
    const store = createStore();
    store.set(queriesAtom, {
      getLessonsQuery: () => ({ queryKey: queryKeys.lessons.all(), queryFn: getLessons }),
    } as unknown as Queries);

    render(
      <I18nProvider i18n={i18n}>
        <QueryClientProvider client={createQueryClient()}>
          <JotaiProvider store={store}>
            <Lessons />
          </JotaiProvider>
        </QueryClientProvider>
      </I18nProvider>,
    );
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(getLessons).toHaveBeenCalledTimes(1);

    await act(() => vi.advanceTimersByTimeAsync(59_999));
    expect(getLessons).toHaveBeenCalledTimes(1);

    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(getLessons).toHaveBeenCalledTimes(2);
  });
});
