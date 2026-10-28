import type { Card, Deck, Review } from "@koloda/srs";
import { SAMPLE_ALGORITHM } from "./algorithm-samples";
import { SAMPLE_TEMPLATE } from "./template-samples";

const [FRONT_FIELD, BACK_FIELD] = SAMPLE_TEMPLATE.content.fields;

const GRADES = { again: 1, hard: 2, good: 3, easy: 4 } as const;

export const SAMPLE_DECK: Deck = {
  id: "0199a1b0-0000-7000-8000-000000000002",
  title: "Spanish irregular verbs",
  notes: "Preterite forms; each prompt names the verb and the person.",
  algorithmId: SAMPLE_ALGORITHM.id,
  templateId: SAMPLE_TEMPLATE.id,
  createdAt: new Date("2026-09-20T18:00:00.000Z"),
  updatedAt: new Date("2026-10-05T19:30:00.000Z"),
};

function untouchedCard(index: number, front: string, back: string, createdAt: string): Card {
  return {
    id: `0199a1e0-0000-7000-8000-${String(index).padStart(12, "0")}`,
    deckId: SAMPLE_DECK.id,
    templateId: SAMPLE_TEMPLATE.id,
    content: { [FRONT_FIELD.id]: { text: front }, [BACK_FIELD.id]: { text: back } },
    state: 0,
    dueAt: null,
    stability: 0,
    difficulty: 0,
    scheduledDays: 0,
    learningSteps: 0,
    reps: 0,
    lapses: 0,
    lastReviewedAt: null,
    createdAt: new Date(createdAt),
    updatedAt: null,
  };
}

const IR: Card = {
  ...untouchedCard(1, "ir (yo)", "fui", "2026-09-20T18:05:00.000Z"),
  state: 2,
  dueAt: new Date("2026-10-30T07:50:00.000Z"),
  stability: 27.4,
  difficulty: 3.9,
  scheduledDays: 27,
  reps: 4,
  lastReviewedAt: new Date("2026-10-03T07:50:00.000Z"),
};

const SER: Card = {
  ...untouchedCard(2, "ser (ella)", "fue — the same form as *ir*", "2026-09-20T18:06:00.000Z"),
  state: 2,
  dueAt: new Date("2026-10-28T08:10:00.000Z"),
  stability: 26.8,
  difficulty: 5.6,
  scheduledDays: 27,
  reps: 4,
  lastReviewedAt: new Date("2026-10-01T08:10:00.000Z"),
  updatedAt: new Date("2026-09-22T20:15:00.000Z"),
};

const ESTAR: Card = {
  ...untouchedCard(3, "estar (yo)", "estuve", "2026-09-20T18:07:00.000Z"),
  state: 3,
  dueAt: new Date("2026-10-28T07:40:00.000Z"),
  stability: 2.1,
  difficulty: 6.8,
  reps: 4,
  lapses: 1,
  lastReviewedAt: new Date("2026-10-28T07:30:00.000Z"),
};

const QUERER: Card = {
  ...untouchedCard(4, "querer (tú)", "quisiste", "2026-10-27T19:00:00.000Z"),
  state: 1,
  dueAt: new Date("2026-10-28T07:31:00.000Z"),
  stability: 0.9,
  difficulty: 6.4,
  learningSteps: 1,
  reps: 2,
  lastReviewedAt: new Date("2026-10-28T07:21:00.000Z"),
};

// WHY: one card in each state, ordered by creation as the database returns them.
// The assistant sample skips `ir (yo)` as already in the deck and adds the last two.
export const SAMPLE_CARDS: Card[] = [
  IR,
  SER,
  ESTAR,
  QUERER,
  untouchedCard(5, "tener (yo)", "tuve", "2026-10-28T09:10:38.000Z"),
  untouchedCard(6, "poder (él)", "pudo", "2026-10-28T09:10:39.000Z"),
];

const SAMPLE_GRADES: [Card, number, string][] = [
  [IR, GRADES.good, "2026-09-21T07:30:00.000Z"],
  [IR, GRADES.good, "2026-09-21T07:40:00.000Z"],
  [IR, GRADES.good, "2026-09-24T07:35:00.000Z"],
  [IR, GRADES.easy, "2026-10-03T07:50:00.000Z"],
  [SER, GRADES.good, "2026-09-21T07:31:00.000Z"],
  [SER, GRADES.good, "2026-09-21T07:41:00.000Z"],
  [SER, GRADES.hard, "2026-09-24T07:36:00.000Z"],
  [SER, GRADES.good, "2026-10-01T08:10:00.000Z"],
  [ESTAR, GRADES.good, "2026-09-21T07:32:00.000Z"],
  [ESTAR, GRADES.good, "2026-09-24T07:37:00.000Z"],
  [ESTAR, GRADES.good, "2026-10-05T08:00:00.000Z"],
  [ESTAR, GRADES.again, "2026-10-28T07:30:00.000Z"],
  [QUERER, GRADES.again, "2026-10-28T07:20:00.000Z"],
  [QUERER, GRADES.good, "2026-10-28T07:21:00.000Z"],
];

// WHY: a card's review list shows only each review's date and grade; the other fields are placeholders.
export const SAMPLE_REVIEWS: Review[] = SAMPLE_GRADES.map(([card, rating, createdAt], index) => ({
  id: `0199a1f0-0000-7000-8000-${String(index + 1).padStart(12, "0")}`,
  cardId: card.id,
  rating,
  state: card.state,
  dueAt: new Date(createdAt),
  stability: card.stability,
  difficulty: card.difficulty,
  scheduledDays: card.scheduledDays,
  learningSteps: card.learningSteps,
  time: 4000,
  isIgnored: false,
  createdAt: new Date(createdAt),
}));
