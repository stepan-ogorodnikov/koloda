import { LEARNING_DAILY_LIMIT_TYPES } from "@koloda/app";
import type { LearningSettings } from "@koloda/app";
import type { ReducerAction } from "@koloda/core-react";
import { dispatchReducerAction } from "@koloda/core-react";
import { createCardFromCardFSRS, createReviewFromReviewFSRS, getCardGrades } from "@koloda/srs";
import type {
  Card,
  CardGrade,
  InsertReviewData,
  LessonData,
  LessonFilters,
  LessonsResult,
  LessonTemplate,
  LessonType,
  TodaysReviewTotals,
} from "@koloda/srs";
import { addHours, addMinutes } from "date-fns";
import { produce } from "immer";
import type { LessonAtomValue } from "./lesson";

export const LESSON_PROGRESS_STATES = {
  0: "untouched",
  1: "learn",
  2: "review",
  3: "learn",
} as const;

const MAX_REVIEW_TIME_MS = 60 * 60 * 1000;

type LessonResultUploadStatus = "success" | "error";

export type LessonPhase = "closed" | "preparing" | "configuring" | "loading-cards" | "studying" | "finished";

export type LessonContent = {
  index: number;
  startedAt: number;
  form: {
    data: Record<number | string, string>;
    firstInputFieldId?: number;
    isSubmitted: boolean;
  };
  card: Card;
  template: LessonTemplate;
  grades: CardGrade[];
};

export type LessonProgress = {
  done: LessonAmounts;
  pending: LessonAmounts;
};

export type LessonSetup = {
  filters: LessonFilters;
  available: LessonsResult["total"];
  reviewTotals: TodaysReviewTotals["reviewTotals"];
  dailyLimits: TodaysReviewTotals["dailyLimits"];
  amounts: LessonAmounts;
  learnAheadLimit: LearningSettings["learnAheadLimit"] | undefined;
};

export type LessonSession = {
  learnAheadLimit: LearningSettings["learnAheadLimit"] | undefined;
  data: LessonData;
  content: LessonContent | null;
  progress: LessonProgress;
};

export type LessonReducerState = {
  phase: LessonPhase;
  request: LessonAtomValue | null;
  setup: LessonSetup | null;
  session: LessonSession | null;
  isTerminationRequested: boolean;
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
  phase: "closed",
  request: null,
  setup: null,
  session: null,
  isTerminationRequested: false,
  upload: {
    queue: [],
    log: {},
  },
};

const actions = {
  open,
  initialize,
  amountUpdated,
  setupSubmitted,
  lessonDataReceived,
  cardSubmitted,
  cardFormUpdated,
  gradeSelected,
  terminationRequested,
  close,
  resultUploaded,
};

function doesRequestMatch(left: LessonAtomValue, right: LessonAtomValue) {
  return left.type === right.type && left.deckId === right.deckId;
}

function filtersFromRequest(request: LessonAtomValue): LessonFilters {
  return { deckIds: request.deckId ? [request.deckId] : [] };
}

function open(draft: LessonReducerState, payload: LessonAtomValue) {
  // INVARIANT: open only starts a closed lesson; repeated opens while active are no-ops.
  if (draft.phase !== "closed") return;

  draft.phase = "preparing";
  draft.request = { ...payload };
}

type InitializePayload = {
  request: LessonAtomValue;
  learnAheadLimit: LearningSettings["learnAheadLimit"] | undefined;
  lessons: LessonsResult;
  todayReviewTotals: TodaysReviewTotals;
};

function initialize(draft: LessonReducerState, payload: InitializePayload) {
  // INVARIANT: initialize only applies during preparing for the active request.
  if (draft.phase !== "preparing" || !draft.request) return;
  if (!doesRequestMatch(payload.request, draft.request)) return;
  // WHY: Strict Mode and stale query results must not reset amounts the user already edited.
  if (draft.setup) return;

  draft.setup = {
    filters: filtersFromRequest(draft.request),
    available: payload.lessons.total,
    reviewTotals: payload.todayReviewTotals.reviewTotals,
    dailyLimits: payload.todayReviewTotals.dailyLimits,
    amounts: calculateInitialLessonAmounts({
      type: draft.request.type,
      available: payload.lessons.total,
      dailyLimits: payload.todayReviewTotals.dailyLimits,
      reviewTotals: payload.todayReviewTotals.reviewTotals,
    }),
    learnAheadLimit: payload.learnAheadLimit,
  };
  draft.phase = "configuring";
}

export type CalculateInitialLessonAmountsOptions = {
  type: LessonType;
  available: LessonsResult["total"];
  dailyLimits: TodaysReviewTotals["dailyLimits"];
  reviewTotals: TodaysReviewTotals["reviewTotals"];
};

export function calculateInitialLessonAmounts({
  type,
  available,
  dailyLimits,
  reviewTotals,
}: CalculateInitialLessonAmountsOptions): LessonAmounts {
  const countedReviewTotal = LEARNING_DAILY_LIMIT_TYPES.reduce(
    (total, limitType) => (dailyLimits[limitType].counts ? total + reviewTotals[limitType] : total),
    0,
  );
  const diffs = {
    untouched: Math.max((dailyLimits.untouched.value || Infinity) - reviewTotals.untouched, 0),
    learn: Math.max((dailyLimits.learn.value || Infinity) - reviewTotals.learn, 0),
    review: Math.max((dailyLimits.review.value || Infinity) - reviewTotals.review, 0),
    total: Math.max((dailyLimits.total || Infinity) - countedReviewTotal, 0),
  };

  if (type === "total") {
    let remainder = diffs.total;
    const amounts: LessonAmounts = { untouched: 0, learn: 0, review: 0, total: 0 };
    LEARNING_DAILY_LIMIT_TYPES.forEach((x) => {
      const amount = getLessonCardsAmount(available[x], diffs[x], dailyLimits[x].counts ? remainder : Infinity);
      amounts[x] = amount;
      if (dailyLimits[x].counts) remainder = remainder - amount;
    });
    amounts.total = Number(amounts.untouched) + Number(amounts.learn) + Number(amounts.review);

    return amounts;
  }

  const limitType = type;
  const amount = getLessonCardsAmount(
    available[limitType],
    diffs[limitType],
    dailyLimits[limitType].counts ? diffs.total : Infinity,
  );

  return { untouched: 0, learn: 0, review: 0, total: amount, [limitType]: amount };
}

function getLessonCardsAmount(available: number, diff: number, remainder: number) {
  return available > Math.min(diff, remainder) ? Math.min(diff, remainder) : available;
}

type AmountUpdatedPayload = {
  type: Exclude<LessonType, "total">;
  value: number;
};

function amountUpdated(draft: LessonReducerState, { type, value }: AmountUpdatedPayload) {
  if (draft.phase !== "configuring" || !draft.setup) return;

  draft.setup.amounts[type] = value;
  const { untouched, learn, review } = draft.setup.amounts;
  draft.setup.amounts.total = Number(untouched) + Number(learn) + Number(review);
}

function setupSubmitted(draft: LessonReducerState) {
  // INVARIANT: setup can only start loading when configuring with a nonzero total.
  if (draft.phase !== "configuring" || !draft.setup?.amounts.total) return;

  draft.phase = "loading-cards";
}

function lessonDataReceived(draft: LessonReducerState, payload: LessonData) {
  // INVARIANT: card data becomes the session snapshot once, during loading-cards.
  if (draft.phase !== "loading-cards") return;
  if (draft.session) return;

  draft.session = {
    learnAheadLimit: draft.setup?.learnAheadLimit,
    data: payload,
    content: null,
    progress: {
      done: { untouched: 0, learn: 0, review: 0, total: 0 },
      pending: { untouched: 0, learn: 0, review: 0, total: 0 },
    },
  };
  moveToNextCard(draft);
  if (draft.phase === "loading-cards") draft.phase = "studying";
}

function moveToNextCard(draft: LessonReducerState) {
  if (!draft.session) return;

  const { cards, decks, templates, algorithms } = draft.session.data;
  const index = typeof draft.session.content?.index === "number" ? draft.session.content.index + 1 : 0;

  if (index && index >= cards.length) {
    if (typeof draft.session.content?.index === "number") draft.session.content.index++;
    draft.phase = "finished";
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

  // WHY: display-only layouts have nothing to submit — show grades immediately.
  const canSubmit = template.layout.reduce((acc, x) => acc || x.operation !== "display", false);

  draft.session.content = {
    index,
    startedAt: Date.now(),
    form: {
      firstInputFieldId: template.layout.find((x) => x.operation === "type")?.field?.id,
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
  if (draft.phase !== "studying") return;
  if (draft.session?.content && !draft.session.content.form.isSubmitted) draft.session.content.form.isSubmitted = true;
}

type CardFormUpdatedPayload = {
  key: number | string;
  value: string;
};

function cardFormUpdated(draft: LessonReducerState, { key, value }: CardFormUpdatedPayload) {
  if (draft.phase !== "studying") return;
  if (draft.session?.content) draft.session.content.form.data[key] = value;
}

function gradeSelected(draft: LessonReducerState, payload: number) {
  if (draft.phase !== "studying") return;
  if (!draft.session?.content) return;

  const grade = draft.session.content.grades[payload];
  const time = Math.min(Date.now() - draft.session.content.startedAt, MAX_REVIEW_TIME_MS);
  const review = {
    ...createReviewFromReviewFSRS(grade.log),
    cardId: draft.session.content.card.id,
    isIgnored: false,
    time,
  };
  const card = createCardFromCardFSRS(grade.card);

  const { index } = draft.session.content;
  draft.upload.queue.push({ index, card, review });

  if (doesLearnAheadMatch(draft, card)) draft.session.data.cards.push(card);
  moveToNextCard(draft);
}

function doesLearnAheadMatch(draft: LessonReducerState, card: Card) {
  const learnAheadLimit = draft.session?.learnAheadLimit;
  if (!learnAheadLimit || !card.dueAt) return false;

  const [hours, minutes] = learnAheadLimit;
  const limitTimestamp = addMinutes(addHours(new Date(), hours), minutes);

  return new Date(card.dueAt) < limitTimestamp;
}

function updateProgressAmounts(draft: LessonReducerState) {
  if (!draft.session?.data.cards || !draft.session.content) return;
  const index = draft.session.content.index || 0;
  const done = { untouched: 0, learn: 0, review: 0, total: 0 };
  const pending = { untouched: 0, learn: 0, review: 0, total: 0 };

  draft.session.data.cards.forEach(({ state }, i) => {
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
  draft.session.progress = { done, pending };
}

function terminationRequested(draft: LessonReducerState, payload: boolean) {
  if (draft.phase === "closed") return;
  draft.isTerminationRequested = payload;
}

function close(draft: LessonReducerState) {
  const next = structuredClone(lessonReducerDefault);
  draft.phase = next.phase;
  draft.request = next.request;
  draft.setup = next.setup;
  draft.session = next.session;
  draft.isTerminationRequested = next.isTerminationRequested;
  draft.upload = next.upload;
}

type ResultUploadedPayload = {
  index: number;
  status: LessonResultUploadStatus;
};

function resultUploaded(draft: LessonReducerState, payload: ResultUploadedPayload) {
  if (draft.phase === "closed") return;

  const queueIndex = draft.upload.queue.findIndex(({ index }) => index === payload.index);
  if (queueIndex !== -1) {
    draft.upload.queue.splice(queueIndex, 1);
    draft.upload.log[payload.index] = payload.status;
  }
}

export type LessonReducerAction = ReducerAction<typeof actions, LessonReducerState>;

export function lessonReducer(state: LessonReducerState, action: LessonReducerAction) {
  return produce(state, (draft) => {
    dispatchReducerAction(draft, actions, action);
  });
}
