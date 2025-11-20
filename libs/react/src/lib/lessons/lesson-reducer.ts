import type { LessonAtomValue, ReducerAction } from "@koloda/react";
import { dispatchReducerAction } from "@koloda/react";
import { createCardFromCardFSRS, createReviewFromReviewFSRS, getCardGrades, maxNumber, minNumber } from "@koloda/srs";
import type {
  Card,
  CardGrade,
  InsertReviewData,
  Lesson,
  LessonData,
  LessonFilters,
  LessonTemplate,
  LessonType,
  TodaysReviewTotals,
} from "@koloda/srs";
import { produce } from "immer";

export const LESSON_PROGRESS_STATES = {
  0: "untouched",
  1: "learn",
  2: "review",
  3: "learn",
} as const;

type LessonResultUploadStatus = "success" | "error";

export type LessonReducerState = {
  meta: {
    status: "init" | "started" | "finished";
    isOpen?: boolean;
    isTerminationRequested?: boolean;
    isInitDataReady?: boolean;
    isError?: boolean;
  };
  filters?: LessonFilters;
  params?: LessonAtomValue;
  lessons?: Lesson[];
  todayReviewTotals?: TodaysReviewTotals;
  amounts?: LessonAmounts;
  data?: LessonData;
  content?: {
    // index of current card to study (in draft.data.cards)
    index: number;
    form: {
      data: Record<number | string, string>;
      isSubmitted: boolean;
    };
    card: Card;
    template: LessonTemplate;
    grades: CardGrade[];
    // counts of cards by types
    progress?: {
      done: LessonAmounts;
      pending: LessonAmounts;
    };
  };
  upload: {
    queue: {
      index: number;
      card: Card;
      review: InsertReviewData;
    }[];
    log: Record<number, LessonResultUploadStatus>;
  };
};

export type LessonAmounts = Record<LessonType, number>;

export const lessonReducerDefault: LessonReducerState = {
  meta: { status: "init" },
  upload: {
    queue: [],
    log: {},
  },
};

const actions = {
  isOpenUpdated,
  terminationRequested,
  paramsSet,
  todayReviewTotalsReceived,
  lessonsDataReceived,
  amountUpdated,
  lessonStarted,
  lessonDataReceived,
  cardSubmitted,
  cardFormUpdated,
  gradeSelected,
  resultUploaded,
};

function isOpenUpdated(draft: LessonReducerState, payload: boolean) {
  draft.meta.isOpen = payload;
  if (payload === false) {
    draft.params = undefined;
    draft.lessons = undefined;
    draft.todayReviewTotals = undefined;
    draft.amounts = undefined;
    draft.content = undefined;
    draft.meta.status = "init";
    draft.meta.isTerminationRequested = false;
    draft.upload.queue = [];
    draft.upload.log = {};
  }
}

function terminationRequested(draft: LessonReducerState, payload: boolean) {
  draft.meta.isTerminationRequested = payload;
}

function paramsSet(draft: LessonReducerState, payload: LessonAtomValue) {
  if (draft.meta.status === "init") {
    draft.meta.isOpen = true;
    draft.params = { ...payload };
    draft.filters = { deckIds: draft.params.deckId ? [draft.params.deckId] : [] };
    setupInitData(draft);
  }
}

function setupInitData(draft: LessonReducerState) {
  const { params, lessons, todayReviewTotals, amounts } = draft;
  if (!params || !lessons || !todayReviewTotals || amounts) return;
  const { dailyLimits } = todayReviewTotals;
  const { type } = params;
  const available = lessons[0];
  const diffs = {
    untouched: maxNumber(dailyLimits.untouched - available.untouched, 0),
    learn: maxNumber(dailyLimits.learn - available.learn, 0),
    review: maxNumber(dailyLimits.review - available.review, 0),
    total: maxNumber(dailyLimits.total - available.total, 0),
  };

  if (params.type === "total") {
    let remainder = diffs.total;
    let amounts: LessonAmounts = { untouched: 0, learn: 0, review: 0, total: 0 };
    const types = ["untouched", "learn", "review"] as const;
    types.forEach((x) => {
      const amount = getLessonCardsAmount(available[x], diffs[x], remainder);
      amounts[x] = amount;
      remainder = remainder - amount;
    });
    amounts.total = Number(amounts.untouched) + Number(amounts.learn) + Number(amounts.review);
    draft.amounts = amounts;
  } else {
    const amount = getLessonCardsAmount(available[type], diffs[type], diffs.total);
    draft.amounts = { untouched: 0, learn: 0, review: 0, total: amount, [type]: amount };
  }
}

function getLessonCardsAmount(available: number, diff: number, remainder: number) {
  return available > minNumber(diff, remainder) ? minNumber(diff, remainder) : available;
}

function todayReviewTotalsReceived(draft: LessonReducerState, payload: TodaysReviewTotals) {
  draft.todayReviewTotals = payload;
  setupInitData(draft);
}

function lessonsDataReceived(draft: LessonReducerState, payload: Lesson[]) {
  draft.lessons = payload;
  setupInitData(draft);
}

type AmountUpdatedPayload = {
  type: Exclude<LessonType, "total">;
  value: number;
};

function amountUpdated(draft: LessonReducerState, { type, value }: AmountUpdatedPayload) {
  if (draft.amounts) {
    draft.amounts[type] = value;
    const { untouched, learn, review } = draft.amounts;
    draft.amounts.total = Number(untouched) + Number(learn) + Number(review);
  }
}

function lessonStarted(draft: LessonReducerState) {
  draft.meta.status = "started";
}

function lessonDataReceived(draft: LessonReducerState, payload: LessonData) {
  if (draft.content) return;
  draft.data = payload;
  moveToNextCard(draft);
}

function moveToNextCard(draft: LessonReducerState) {
  if (!draft.data) return;

  const { cards, decks, templates, algorithms } = draft.data;
  const index = typeof draft.content?.index === "number" ? draft.content.index + 1 : 0;

  if (index && index >= cards.length) {
    if (typeof draft.content?.index === "number") draft.content.index++;
    draft.meta.status = "finished";
    updateProgressAmounts(draft);
    return;
  }

  const card = cards[index];
  if (!card) return;

  const deck = decks.find(({ id }) => id === card.deckId);
  if (!deck) return;

  const algorithm = algorithms.find(({ id }) => id === deck.algorithmId);
  if (!algorithm) return;

  const template = templates.find(({ id }) => id === deck.templateId);
  if (!template) return;

  // if all the actions are 'display' there is nothing to submit and grades are shown right away
  const canSubmit = template.layout.reduce((acc, x) => (
    acc || x.operation !== "display"
  ), false);

  draft.content = {
    index,
    form: {
      data: {},
      isSubmitted: !canSubmit,
    },
    card,
    template,
    grades: getCardGrades(card, algorithm),
  };
  updateProgressAmounts(draft);
}

function cardSubmitted(draft: LessonReducerState) {
  if (draft.content && !draft.content?.form.isSubmitted) draft.content.form.isSubmitted = true;
}

type CardFormUpdatedPayload = {
  key: number | string;
  value: string;
};

function cardFormUpdated(draft: LessonReducerState, { key, value }: CardFormUpdatedPayload) {
  if (draft.content) draft.content.form.data[key] = value;
}

function gradeSelected(draft: LessonReducerState, payload: number) {
  if (draft.content) {
    const grade = draft.content.grades[payload];
    const review = { ...createReviewFromReviewFSRS(grade.log), cardId: draft.content.card.id, isIgnored: false };
    const card = createCardFromCardFSRS(grade.card);

    const { index } = draft.content;
    draft.upload.queue.push({ index, card, review });

    if (draft.data && [0, 1].includes(payload)) draft.data.cards.push(card);
    moveToNextCard(draft);
  }
}

function updateProgressAmounts(draft: LessonReducerState) {
  if (!draft?.data?.cards || !draft.content) return;
  const index = draft?.content?.index || 0;
  const done = { untouched: 0, learn: 0, review: 0, total: 0 };
  const pending = { untouched: 0, learn: 0, review: 0, total: 0 };

  draft.data.cards.forEach(({ state }, i) => {
    const type = LESSON_PROGRESS_STATES[state as keyof typeof LESSON_PROGRESS_STATES];
    if (type) {
      if (i < index) {
        done[type]++;
        done.total++;
      } else {
        pending[type]++;
        pending.total++;
      }
    }
  });
  draft.content.progress = { done, pending };
}

type ResultUploadedPayload = {
  index: number;
  status: LessonResultUploadStatus;
};

function resultUploaded(draft: LessonReducerState, payload: ResultUploadedPayload) {
  const queueIndex = draft.upload.queue.findIndex(({ index }) => index === payload.index);
  if (queueIndex !== -1) {
    draft.upload.queue.splice(queueIndex, 1);
    draft.upload.log[payload.index] = payload.status;
  }
}

export type LessonReducerAction = ReducerAction<typeof actions, LessonReducerState>;

export const lessonReducer = produce((draft: LessonReducerState, action: LessonReducerAction) => {
  dispatchReducerAction(draft, actions, action);
  return draft;
});
