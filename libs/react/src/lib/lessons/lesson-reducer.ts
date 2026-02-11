import type { LessonAtomValue, ReducerAction } from "@koloda/react";
import { dispatchReducerAction } from "@koloda/react";
import { createCardFromCardFSRS, createReviewFromReviewFSRS, getCardGrades } from "@koloda/srs";
import type {
  Card,
  CardGrade,
  InsertReviewData,
  LearningSettings,
  Lesson,
  LessonData,
  LessonFilters,
  LessonTemplate,
  LessonType,
  TodaysReviewTotals,
} from "@koloda/srs";
import { addHours, addMinutes } from "date-fns";
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
    isOpen?: boolean;
    isTerminationRequested?: boolean;
    isError?: boolean;
    // user submitted amounts of cards for this lesson, proceed to load LessonData
    isSubmitted?: boolean;
    // all the LessonData is loaded and cards are ready to be displayed
    isStarted?: boolean;
    // all the cards for this lesson are reviewed and submitted
    isFinished?: boolean;
    // status: "init" | "started" | "ready" | "finished";
  };
  learnAheadLimit?: LearningSettings["learnAheadLimit"];
  // values that define decks to study
  params?: LessonAtomValue;
  // object to pass to lesson query based on params above
  filters?: LessonFilters;
  // available amounts of cards to study of each type for each deck and all decks in total
  lessons?: Lesson[];
  // daily limits and review counts for current learning day
  todayReviewTotals?: TodaysReviewTotals;
  // counts of cards for each type to study for this lesson
  amounts?: LessonAmounts;
  // data required for a lesson (decks, cards, algorithms, templates)
  data?: LessonData;
  // data related to the card that is being studied
  content?: {
    // index of current card to study (in state.data.cards)
    index: number;
    // form data for certain operations, e.g., 'type'
    form: {
      data: Record<number | string, string>;
      // field id of the first field that should be autofocused
      firstInputFieldId?: number;
      isSubmitted: boolean;
    };
    card: Card;
    template: LessonTemplate;
    // array of grades from ts-fsrs in order: [Again, Hard, Good, Easy]
    grades: CardGrade[];
  };
  // counts of cards of each type that are studied | to study
  progress?: {
    done: LessonAmounts;
    pending: LessonAmounts;
  };
  // data related to uploading results of studied cards
  upload: {
    // array of records to upload
    queue: {
      index: number;
      card: Card;
      review: InsertReviewData;
    }[];
    // results of upload operations
    log: Record<number, LessonResultUploadStatus>;
  };
};

export type LessonAmounts = Record<LessonType, number>;

export const lessonReducerDefault: LessonReducerState = {
  meta: {},
  upload: {
    queue: [],
    log: {},
  },
};

const actions = {
  isOpenUpdated,
  terminationRequested,
  learnAheadLimitReceived,
  paramsSet,
  todayReviewTotalsReceived,
  lessonsReceived,
  amountUpdated,
  lessonSubmitted,
  lessonDataReceived,
  cardSubmitted,
  cardFormUpdated,
  gradeSelected,
  resultUploaded,
};

/**
 * Controls open/closed state for lesson modal
 * Since root lesson components stays mounted resets reducer state on close
 */
function isOpenUpdated(draft: LessonReducerState, payload: boolean) {
  draft.meta.isOpen = payload;
  if (payload === false) {
    draft.meta.isSubmitted = undefined;
    draft.meta.isStarted = undefined;
    draft.meta.isFinished = undefined;
    draft.params = undefined;
    draft.lessons = undefined;
    draft.todayReviewTotals = undefined;
    draft.amounts = undefined;
    draft.data = undefined;
    draft.content = undefined;
    draft.meta.isTerminationRequested = false;
    draft.upload.queue = [];
    draft.upload.log = {};
  }
}

/**
 * Sets termination request status for close dialog
 */
function terminationRequested(draft: LessonReducerState, payload: boolean) {
  draft.meta.isTerminationRequested = payload;
}

/**
 * Sets the learn ahead limit received from settings
 */
function learnAheadLimitReceived(draft: LessonReducerState, payload: LearningSettings["learnAheadLimit"]) {
  draft.learnAheadLimit = payload;
}

/**
 * Sets lesson params received from lesson init form
 * Makes filters for lesson query based on these params
 */
function paramsSet(draft: LessonReducerState, payload: LessonAtomValue) {
  if (!draft.meta.isOpen) {
    draft.meta.isOpen = true;
    draft.params = { ...payload };
    draft.filters = { deckIds: draft.params.deckId ? [draft.params.deckId] : [] };
    setupInitData(draft);
  }
}

/**
 * Calculates initial amounts of cards of each type for lesson init form
 */
function setupInitData(draft: LessonReducerState) {
  const { params, lessons, todayReviewTotals, amounts } = draft;
  if (!params || !lessons || !todayReviewTotals || amounts) return;
  const { dailyLimits } = todayReviewTotals;
  const { type } = params;
  const available = lessons[0];
  const diffs = {
    untouched: Math.max((dailyLimits.untouched || Infinity) - available.untouched, 0),
    learn: Math.max((dailyLimits.learn || Infinity) - available.learn, 0),
    review: Math.max((dailyLimits.review || Infinity) - available.review, 0),
    total: Math.max((dailyLimits.total || Infinity) - available.total, 0),
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

/**
 * Calculates the number of lesson cards based on available cards and daily limits
 * @param available - The number of available cards of a specific type
 * @param diff - The difference between daily limit and currently available cards
 * @param remainder - The remainder of available total spots for cards
 * @returns The calculated amount of cards to add to the lesson
 */
function getLessonCardsAmount(available: number, diff: number, remainder: number) {
  return available > Math.min(diff, remainder) ? Math.min(diff, remainder) : available;
}

/**
 * Sets review totals for today received from storage
 */
function todayReviewTotalsReceived(draft: LessonReducerState, payload: TodaysReviewTotals) {
  draft.todayReviewTotals = payload;
  setupInitData(draft);
}

/**
 * Sets lessons data received from storage
 */
function lessonsReceived(draft: LessonReducerState, payload: Lesson[]) {
  draft.lessons = payload;
  setupInitData(draft);
}

type AmountUpdatedPayload = {
  type: Exclude<LessonType, "total">;
  value: number;
};

/**
 * Updates the lesson card amount for a specific type and recalculates total
 */
function amountUpdated(draft: LessonReducerState, { type, value }: AmountUpdatedPayload) {
  if (draft.amounts) {
    draft.amounts[type] = value;
    const { untouched, learn, review } = draft.amounts;
    draft.amounts.total = Number(untouched) + Number(learn) + Number(review);
  }
}

/**
 * Marks lesson as submitted to start loading LessonData
 */
function lessonSubmitted(draft: LessonReducerState) {
  draft.meta.isSubmitted = true;
}

/**
 * Sets data required for current lesson (decks, cards, algorithms, templates)
 * Marks lesson as started since data is loaded
 */
function lessonDataReceived(draft: LessonReducerState, payload: LessonData) {
  if (draft.content) return;
  draft.data = payload;
  moveToNextCard(draft);
  draft.meta.isStarted = true;
}

/**
 * Increments index of currently studied card (sets to 0 on the first call)
 * Sets 'content' state with data related to that card
 * Updates lesson progress data
 * If there are no more cards, sets the lesson status to 'finished'
 */
function moveToNextCard(draft: LessonReducerState) {
  if (!draft.data) return;

  const { cards, decks, templates, algorithms } = draft.data;
  const index = typeof draft.content?.index === "number" ? draft.content.index + 1 : 0;

  if (index && index >= cards.length) {
    if (typeof draft.content?.index === "number") draft.content.index++;
    draft.meta.isFinished = true;
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

/**
 * Marks current card as submitted
 */
function cardSubmitted(draft: LessonReducerState) {
  if (draft.content && !draft.content?.form.isSubmitted) draft.content.form.isSubmitted = true;
}

type CardFormUpdatedPayload = {
  key: number | string;
  value: string;
};

/**
 * Updates value for a single field in form data for current card
 */
function cardFormUpdated(draft: LessonReducerState, { key, value }: CardFormUpdatedPayload) {
  if (draft.content) draft.content.form.data[key] = value;
}

/**
 * Submits grade for current card
 * Adds card and review to the upload queue
 * Proceeds to next card if any
 */
function gradeSelected(draft: LessonReducerState, payload: number) {
  if (draft.content && draft.data) {
    const grade = draft.content.grades[payload];
    const review = { ...createReviewFromReviewFSRS(grade.log), cardId: draft.content.card.id, isIgnored: false };
    const card = createCardFromCardFSRS(grade.card);

    const { index } = draft.content;
    draft.upload.queue.push({ index, card, review });

    if (doesLearnAheadMatch(draft, card)) draft.data.cards.push(card);
    moveToNextCard(draft);
  }
}

/**
 * Checks if a card's due is over the learn ahead limit
 * @param draft The lesson reducer state
 * @param card The card to check
 * @returns true if card's due is sooner than the learn ahead limit, false if it's later
 */
function doesLearnAheadMatch(draft: LessonReducerState, card: Card) {
  if (!draft.learnAheadLimit || !card.dueAt) return false;

  const [hours, minutes] = draft.learnAheadLimit;
  const limitTimestamp = addMinutes(addHours(new Date(), hours), minutes);

  return new Date(card.dueAt) < limitTimestamp;
}

/**
 * Updates the progress data for every lesson type
 */
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
  draft.progress = { done, pending };
}

type ResultUploadedPayload = {
  index: number;
  status: LessonResultUploadStatus;
};

/**
 * Updates the upload queue and log when a review result has been uploaded
 * Removes the entry from the queue and adds result of upload operation to log
 */
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
