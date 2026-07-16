import type { Queries } from "./queries";

/**
 * Canonical Queries method names. Compile-time exhaustiveness is enforced below so
 * adding a method to `Queries` without updating this list fails typecheck.
 */
export const QUERIES_METHODS = [
  "getSettingsQuery",
  "setSettingsMutation",
  "patchSettingsMutation",
  "getConversationQuery",
  "getConversationsQuery",
  "setConversationMutation",
  "deleteConversationMutation",
  "getAlgorithmsQuery",
  "getAlgorithmQuery",
  "addAlgorithmMutation",
  "cloneAlgorithmMutation",
  "updateAlgorithmMutation",
  "deleteAlgorithmMutation",
  "getAlgorithmDecksQuery",
  "getDecksQuery",
  "getDeckQuery",
  "addDeckMutation",
  "updateDeckMutation",
  "deleteDeckMutation",
  "getTemplatesQuery",
  "getTemplateQuery",
  "addTemplateMutation",
  "cloneTemplateMutation",
  "updateTemplateMutation",
  "deleteTemplateMutation",
  "getTemplateDecksQuery",
  "getCardsQuery",
  "addCardMutation",
  "addCardsMutation",
  "updateCardMutation",
  "deleteCardMutation",
  "deleteCardsMutation",
  "resetCardProgressMutation",
  "getLessonsQuery",
  "getTodayReviewTotalsQuery",
  "getLessonDataQuery",
  "submitLessonResultMutation",
  "getReviewsQuery",
  "addAIProfileMutation",
  "updateAIProfileMutation",
  "removeAIProfileMutation",
  "touchAIProfileMutation",
  "getAIProfileModelsQuery",
  "getAIProfilesQuery",
] as const satisfies readonly (keyof Queries)[];

type MissingQueriesMethods = Exclude<keyof Queries, (typeof QUERIES_METHODS)[number]>;
type ExtraQueriesMethods = Exclude<(typeof QUERIES_METHODS)[number], keyof Queries>;

true satisfies [MissingQueriesMethods] extends [never] ? true : false;
true satisfies [ExtraQueriesMethods] extends [never] ? true : false;

export type QueriesMethodName = (typeof QUERIES_METHODS)[number];

const QUERIES_METHOD_SET = new Set<string>(QUERIES_METHODS);

export function getQueriesContractIssues(queries: object): string[] {
  const keys = Object.keys(queries);
  const keySet = new Set(keys);
  const issues: string[] = [];

  for (const method of QUERIES_METHODS) {
    if (!keySet.has(method)) {
      issues.push(`missing: ${method}`);
      continue;
    }
    if (typeof (queries as Record<string, unknown>)[method] !== "function") {
      issues.push(`not a function: ${method}`);
    }
  }

  for (const key of keys) {
    if (!QUERIES_METHOD_SET.has(key)) {
      issues.push(`unexpected: ${key}`);
    }
  }

  return issues;
}

export function assertQueriesContract(queries: object): asserts queries is Queries {
  const issues = getQueriesContractIssues(queries);
  if (issues.length > 0) {
    throw new Error(`Queries contract violated:\n- ${issues.join("\n- ")}`);
  }
}
