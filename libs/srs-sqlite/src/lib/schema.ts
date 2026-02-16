import { index, integer, real, sqliteTable as table, text, uniqueIndex } from "drizzle-orm/sqlite-core";

const timestamps = {
  updatedAt: integer("updated_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" })
    .$defaultFn(() => new Date())
    .notNull(),
};

export const settings = table(
  "settings",
  {
    id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    content: text("content", { mode: "json" }).notNull().default("{}"),
    ...timestamps,
  },
  (t) => [uniqueIndex("settings_name_idx").on(t.name)],
);

export const algorithms = table(
  "algorithms",
  {
    id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
    title: text("title").notNull(),
    content: text("content", { mode: "json" }).notNull(),
    ...timestamps,
  },
  (t) => [index("algorithms_title_idx").on(t.title)],
);

export const templates = table(
  "templates",
  {
    id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
    title: text("title").notNull(),
    content: text("content", { mode: "json" }).notNull(),
    ...timestamps,
  },
  (t) => [index("templates_title_idx").on(t.title)],
);

export const decks = table(
  "decks",
  {
    id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
    title: text("title").notNull(),
    algorithmId: integer("algorithm_id")
      .notNull()
      .references(() => algorithms.id),
    templateId: integer("template_id")
      .notNull()
      .references(() => templates.id),
    ...timestamps,
  },
  (t) => [index("decks_title_idx").on(t.title)],
);

export const cards = table(
  "cards",
  {
    id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
    deckId: integer("deck_id")
      .notNull()
      .references(() => decks.id, { onDelete: "cascade" }),
    templateId: integer("template_id")
      .notNull()
      .references(() => templates.id),
    content: text("content", { mode: "json" }),
    state: integer("state").default(0),
    dueAt: integer("due_at", { mode: "timestamp" }),
    stability: real("stability").default(0),
    difficulty: real("difficulty").default(0),
    scheduledDays: integer("scheduled_days").default(0),
    learningSteps: integer("learning_steps").default(0),
    reps: integer("reps").default(0),
    lapses: integer("lapses").default(0),
    lastReviewedAt: integer("last_reviewed_at", { mode: "timestamp" }),
    ...timestamps,
  },
  (t) => [index("cards_due_at_idx").on(t.dueAt)],
);

export const reviews = table("reviews", {
  id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  cardId: integer("card_id")
    .notNull()
    .references(() => cards.id, { onDelete: "cascade" }),
  state: integer("state").notNull().default(0),
  rating: integer("rating").notNull().default(0),
  dueAt: integer("due_at", { mode: "timestamp" }),
  stability: real("stability").notNull().default(0),
  difficulty: real("difficulty").notNull().default(0),
  scheduledDays: integer("scheduled_days").notNull().default(0),
  learningSteps: integer("learning_steps").notNull().default(0),
  time: integer("time").notNull().default(0),
  isIgnored: integer("is_ignored", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at", { mode: "timestamp" })
    .$defaultFn(() => new Date())
    .notNull(),
});

export const schema = {
  settings,
  algorithms,
  templates,
  decks,
  cards,
  reviews,
};
