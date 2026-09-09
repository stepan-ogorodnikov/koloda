export const ALGORITHM_SELECT = "id, title, content, created_at AS createdAt, updated_at AS updatedAt";

export const TEMPLATE_SELECT = "t.id, t.title, t.content, t.created_at AS createdAt, t.updated_at AS updatedAt";

export const DECK_SELECT =
  "id, title, algorithm_id AS algorithmId, template_id AS templateId, created_at AS createdAt, updated_at AS updatedAt";

export const CARD_SELECT = `id, deck_id AS deckId, template_id AS templateId, content, state, due_at AS dueAt,
  stability, difficulty, scheduled_days AS scheduledDays, learning_steps AS learningSteps, reps, lapses,
  last_reviewed_at AS lastReviewedAt, created_at AS createdAt, updated_at AS updatedAt`;

export const REVIEW_SELECT = `id, card_id AS cardId, rating, state, due_at AS dueAt, stability, difficulty,
  scheduled_days AS scheduledDays, learning_steps AS learningSteps, time, is_ignored AS isIgnored, created_at AS createdAt`;

export const SETTINGS_SELECT = "id, name, content, created_at AS createdAt, updated_at AS updatedAt";

export const CONVERSATION_SELECT = "id, title, state, created_at AS createdAt, updated_at AS updatedAt";

export const TEMPLATE_LOCKED_SELECT = `EXISTS(
  SELECT 1 FROM cards c
  WHERE c.template_id = t.id
  LIMIT 1
) AS isLocked`;
