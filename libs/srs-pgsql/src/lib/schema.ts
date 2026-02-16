import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgTable as table,
  real,
  smallint,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

const timestamps = {
  updatedAt: timestamp("updated_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
};

export const settings = table(
  "settings",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    name: varchar().notNull(),
    content: jsonb().notNull().default({}),
    ...timestamps,
  },
  (table) => [uniqueIndex("settings_name_idx").on(table.name)],
);

export const algorithms = table(
  "algorithms",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    title: varchar({ length: 255 }).notNull(),
    content: jsonb().notNull().$type<object>(),
    ...timestamps,
  },
  (table) => [index("algorithms_title_idx").on(table.title)],
);

export const templates = table(
  "templates",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    title: varchar({ length: 255 }).notNull(),
    content: jsonb().notNull(),
    ...timestamps,
  },
  (table) => [index("templates_title_idx").on(table.title)],
);

export const decks = table(
  "decks",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    title: varchar({ length: 255 }).notNull(),
    algorithmId: integer("algorithm_id")
      .notNull()
      .references(() => algorithms.id),
    templateId: integer("template_id")
      .notNull()
      .references(() => templates.id),
    ...timestamps,
  },
  (table) => [index("decks_title_idx").on(table.title)],
);

export const cards = table(
  "cards",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    deckId: integer("deck_id")
      .notNull()
      .references(() => decks.id, { onDelete: "cascade" }),
    templateId: integer("template_id")
      .notNull()
      .references(() => templates.id),
    content: jsonb(),
    state: integer().default(0),
    dueAt: timestamp("due_at"),
    stability: real().default(0),
    difficulty: real().default(0),
    scheduledDays: integer("scheduled_days").default(0),
    learningSteps: integer().default(0),
    reps: integer().default(0),
    lapses: integer().default(0),
    lastReviewedAt: timestamp("last_reviewed_at"),
    ...timestamps,
  },
  (table) => [index("cards_due_at_idx").on(table.dueAt)],
);

export const reviews = table("reviews", {
  id: bigint({ mode: "bigint" }).primaryKey().generatedAlwaysAsIdentity(),
  cardId: integer("card_id")
    .notNull()
    .references(() => cards.id, { onDelete: "cascade" }),
  state: smallint().notNull().default(0),
  rating: smallint().notNull().default(0),
  dueAt: timestamp("due_at"),
  stability: real().notNull().default(0),
  difficulty: real().notNull().default(0),
  scheduledDays: integer("scheduled_days").notNull().default(0),
  learningSteps: integer().notNull().default(0),
  time: integer().notNull().default(0),
  isIgnored: boolean("is_ignored").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const schema = {
  settings,
  algorithms,
  decks,
  templates,
  cards,
  reviews,
};
