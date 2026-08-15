import { hotkeysScopesAtom, queriesAtom, queryKeys } from "@koloda/core-react";
import type { Queries } from "@koloda/core-react";
import { QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { createStore, Provider as JotaiProvider } from "jotai";
import type { PropsWithChildren } from "react";
import { describe, expect, it, vi } from "vitest";
import {
  createLessonData,
  createLessonsResult,
  createQueryClient,
  createTodaysReviewTotals,
} from "../../test/test-helpers";
import { openLessonAtom, submitLessonSetupAtom } from "./lesson-actions";
import { lessonContentAtom, lessonPhaseAtom, lessonSetupAtom } from "./lesson-selectors";
import { lessonStateAtom } from "./lesson-store";
import { useLessonSession } from "./use-lesson-session";

const TOTAL_LESSONS = createLessonsResult({
  total: {
    untouched: 5,
    learn: 4,
    review: 8,
    total: 17,
  },
});

const TOTAL_TODAY_REVIEW_TOTALS = createTodaysReviewTotals({
  dailyLimits: {
    total: 6,
    untouched: { value: 3, counts: true },
    learn: { value: 2, counts: true },
    review: { value: 4, counts: false },
  },
  reviewTotals: {
    untouched: 1,
    learn: 1,
    review: 3,
  },
});

const REQUEST = { type: "total" as const, deckId: 7 };

function buildQueries(overrides: Partial<Queries> = {}): Queries {
  return {
    getSettingsQuery: (name) => ({
      queryKey: queryKeys.settings.detail(name),
      queryFn: async () => null,
    }),
    getTodayReviewTotalsQuery: () => ({
      queryKey: queryKeys.lessons.todayReviewTotals(),
      queryFn: async () => TOTAL_TODAY_REVIEW_TOTALS,
    }),
    getLessonsQuery: (filters) => ({
      queryKey: queryKeys.lessons.all(filters),
      queryFn: async () => TOTAL_LESSONS,
    }),
    getLessonDataQuery: (params) => ({
      queryKey: queryKeys.lessons.data(params),
      queryFn: async () => createLessonData(),
    }),
    submitLessonResultMutation: () => ({
      mutationFn: async () => undefined,
    }),
    ...overrides,
  } as unknown as Queries;
}

function createWrapper(options?: { queries?: Queries }) {
  const store = createStore();
  const queryClient = createQueryClient();
  const queries = options?.queries ?? buildQueries();
  store.set(queriesAtom, queries);
  store.set(hotkeysScopesAtom, ["nav"]);

  return {
    store,
    queryClient,
    Wrapper: function Wrapper({ children }: PropsWithChildren) {
      return (
        <QueryClientProvider client={queryClient}>
          <JotaiProvider store={store}>{children}</JotaiProvider>
        </QueryClientProvider>
      );
    },
  };
}

describe("useLessonSession", () => {
  it("initializes once when settings, totals, and lessons are ready", async () => {
    const { store, Wrapper } = createWrapper();
    renderHook(() => useLessonSession(), { wrapper: Wrapper });

    act(() => {
      store.set(openLessonAtom, REQUEST);
    });

    await waitFor(() => {
      expect(store.get(lessonPhaseAtom)).toBe("configuring");
    });

    expect(store.get(lessonSetupAtom)?.filters).toEqual({ deckIds: [7] });
    expect(store.get(lessonSetupAtom)?.learnAheadLimit).toBeUndefined();
    expect(store.get(lessonSetupAtom)?.available).toEqual(TOTAL_LESSONS.total);
  });

  it("does not initialize until the lessons query resolves", async () => {
    let resolveLessons!: (value: typeof TOTAL_LESSONS) => void;
    const { store, Wrapper } = createWrapper({
      queries: buildQueries({
        getLessonsQuery: (filters) => ({
          queryKey: queryKeys.lessons.all(filters),
          queryFn: () =>
            new Promise((resolve) => {
              resolveLessons = resolve;
            }),
        }),
      }),
    });
    renderHook(() => useLessonSession(), { wrapper: Wrapper });

    act(() => {
      store.set(openLessonAtom, REQUEST);
    });

    await waitFor(() => {
      expect(store.get(lessonPhaseAtom)).toBe("preparing");
    });
    expect(store.get(lessonSetupAtom)).toBeNull();

    await act(async () => {
      resolveLessons(TOTAL_LESSONS);
    });

    await waitFor(() => {
      expect(store.get(lessonPhaseAtom)).toBe("configuring");
    });
  });

  it("loads card data once after setup is submitted", async () => {
    const { store, Wrapper } = createWrapper();
    renderHook(() => useLessonSession(), { wrapper: Wrapper });

    act(() => {
      store.set(openLessonAtom, REQUEST);
    });
    await waitFor(() => {
      expect(store.get(lessonPhaseAtom)).toBe("configuring");
    });

    act(() => {
      store.set(submitLessonSetupAtom);
    });

    await waitFor(() => {
      expect(store.get(lessonPhaseAtom)).toBe("studying");
    });
    expect(store.get(lessonContentAtom)?.index).toBe(0);
  });

  it("invalidates lesson queries from the explicit close path", async () => {
    const { store, queryClient, Wrapper } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useLessonSession(), { wrapper: Wrapper });

    act(() => {
      store.set(openLessonAtom, REQUEST);
    });
    await waitFor(() => {
      expect(store.get(lessonPhaseAtom)).toBe("configuring");
    });

    act(() => {
      result.current.closeLesson();
    });

    expect(store.get(lessonStateAtom).phase).toBe("closed");
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.lessons.all({ deckIds: [7] }) });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.lessons.all() });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.lessons.todayReviewTotals() });
  });

  it("restores nav scope when unmounted while open", async () => {
    const { store, Wrapper } = createWrapper();
    const { unmount } = renderHook(() => useLessonSession(), { wrapper: Wrapper });

    act(() => {
      store.set(openLessonAtom, REQUEST);
    });

    await waitFor(() => {
      expect(store.get(hotkeysScopesAtom)).toContain("lesson");
      expect(store.get(hotkeysScopesAtom)).not.toContain("nav");
    });

    unmount();

    expect(store.get(hotkeysScopesAtom)).toContain("nav");
    expect(store.get(hotkeysScopesAtom)).not.toContain("lesson");
  });
});
