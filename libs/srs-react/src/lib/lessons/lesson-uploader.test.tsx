import { queriesAtom } from "@koloda/core-react";
import type { Queries } from "@koloda/core-react";
import type { LessonResultData } from "@koloda/srs";
import { QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { createStore, Provider as JotaiProvider } from "jotai";
import type { PropsWithChildren } from "react";
import { describe, expect, it } from "vitest";
import {
  createCard,
  createLessonData,
  createLessonsResult,
  createQueryClient,
  createTodaysReviewTotals,
} from "../../test/test-helpers";
import {
  initializeLessonAtom,
  openLessonAtom,
  receiveLessonDataAtom,
  selectLessonGradeAtom,
  submitLessonSetupAtom,
} from "./lesson-actions";
import { lessonUploadHeadAtom, lessonUploadLogAtom } from "./lesson-selectors";
import { lessonStateAtom } from "./lesson-store";
import { useLessonUploader } from "./lesson-uploader";

const REQUEST = { type: "total" as const, deckId: 7 };

function initializePayload() {
  return {
    request: REQUEST,
    learnAheadLimit: [0, 30] as [number, number],
    lessons: createLessonsResult({
      total: {
        untouched: 5,
        learn: 4,
        review: 8,
        total: 17,
      },
    }),
    todayReviewTotals: createTodaysReviewTotals({
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
    }),
  };
}

function enqueueTwoUploads(store: ReturnType<typeof createStore>) {
  store.set(openLessonAtom, REQUEST);
  store.set(initializeLessonAtom, initializePayload());
  store.set(submitLessonSetupAtom);
  store.set(
    receiveLessonDataAtom,
    createLessonData({
      cards: [createCard({ id: 1 }), createCard({ id: 2 })],
    }),
  );
  store.set(selectLessonGradeAtom, 2);
  store.set(selectLessonGradeAtom, 2);
}

describe("useLessonUploader", () => {
  it("uploads queue items in order and settles each before the next", async () => {
    const submitted: LessonResultData[] = [];
    const pending: Array<{ resolve: () => void }> = [];
    const store = createStore();
    const queryClient = createQueryClient();
    store.set(queriesAtom, {
      submitLessonResultMutation: () => ({
        mutationFn: (data: LessonResultData) => {
          submitted.push(data);
          return new Promise<undefined>((resolve) => {
            pending.push({ resolve: () => resolve(undefined) });
          });
        },
      }),
    } as unknown as Queries);

    enqueueTwoUploads(store);
    expect(store.get(lessonStateAtom).upload.queue).toHaveLength(2);
    const first = store.get(lessonUploadHeadAtom);
    const secondIndex = store.get(lessonStateAtom).upload.queue[1]?.index;
    expect(first?.index).toBe(0);
    expect(secondIndex).toBe(1);

    function Wrapper({ children }: PropsWithChildren) {
      return (
        <QueryClientProvider client={queryClient}>
          <JotaiProvider store={store}>{children}</JotaiProvider>
        </QueryClientProvider>
      );
    }

    renderHook(() => useLessonUploader(), { wrapper: Wrapper });

    await waitFor(() => {
      expect(submitted).toHaveLength(1);
    });
    expect(submitted[0]?.card.id).toBe(first?.card.id);
    expect(submitted[0]?.review.cardId).toBe(first?.review.cardId);

    await act(async () => {
      pending[0]?.resolve();
    });

    await waitFor(() => {
      expect(store.get(lessonUploadLogAtom)[0]).toBe("success");
      expect(store.get(lessonUploadHeadAtom)?.index).toBe(1);
      expect(submitted).toHaveLength(2);
    });
    expect(submitted[1]?.review.cardId).toBe(2);

    await act(async () => {
      pending[1]?.resolve();
    });

    await waitFor(() => {
      expect(store.get(lessonUploadLogAtom)[1]).toBe("success");
      expect(store.get(lessonStateAtom).upload.queue).toEqual([]);
    });
  });
});
