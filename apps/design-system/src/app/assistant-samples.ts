import type { AIModel, AIProfile } from "@koloda/ai";
import type { Conversation } from "@koloda/app";
import { SAMPLE_DECK } from "./deck-samples";
import { SAMPLE_TEMPLATE } from "./template-samples";

export const SAMPLE_AI_PROFILE: AIProfile = {
  id: "0199b2c0-0000-7000-8000-000000000001",
  title: "OpenRouter",
  secrets: { provider: "openrouter", apiKey: null },
  hasSecrets: true,
  createdAt: new Date("2026-10-01T09:00:00.000Z"),
};

export const SAMPLE_AI_MODELS: AIModel[] = [
  { id: "anthropic/claude-sonnet-4.5", name: "Claude Sonnet 4.5", context_length: 200_000 },
  { id: "openai/gpt-5-mini", name: "GPT-5 Mini", context_length: 400_000 },
];

const NORMAL_ID = "0199b2c0-0000-7000-8000-000000000101";
const BROKEN_ID = "0199b2c0-0000-7000-8000-000000000102";
const CARDS_ID = "0199b2c0-0000-7000-8000-000000000103";

// WHY: the Spanish deck is the one on the decks page and the template the one on the templates page,
// so the pages tell one story.
const SPANISH_DECK_ID = SAMPLE_DECK.id;
const TEMPLATE_FIELDS = SAMPLE_TEMPLATE.content.fields;
const [FRONT_FIELD, BACK_FIELD] = TEMPLATE_FIELDS;

function userMessage(runId: string, text: string, createdAt: string) {
  return { id: `user-${runId}`, role: "user", metadata: { createdAt, runId }, parts: [{ type: "text", text }] };
}

function assistantMessage(runId: string, text: string) {
  return {
    id: `assistant-${runId}`,
    role: "assistant",
    metadata: { kind: "chat-text", runId },
    parts: [{ type: "text", text }],
  };
}

function successRun(id: string, startedAt: string, elapsedSeconds: number, totalTokens: number) {
  return {
    id,
    status: "success",
    cards: [],
    cardStatuses: {},
    templateFields: null,
    startedAt,
    elapsedSeconds,
    modelName: SAMPLE_AI_MODELS[0].name,
    usage: { promptTokens: totalTokens - 400, completionTokens: 400, totalTokens },
    toolCalls: [],
  };
}

// WHY: `state` is the stored JSON shape that restore validates (`conversation-persistence-schema.ts` in
// `@koloda/assistant-react`), with ISO date strings. A field that drifts from it turns the sample corrupt.
const normalState = {
  schemaVersion: 1,
  id: NORMAL_ID,
  createdAt: "2026-10-27T18:00:00.000Z",
  updatedAt: "2026-10-27T18:03:10.000Z",
  messages: [
    userMessage("run-1", "What's the difference between ser and estar?", "2026-10-27T18:00:00.000Z"),
    assistantMessage(
      "run-1",
      [
        "Both mean *to be*, but they answer different questions:",
        "",
        "- **Ser** is for what something *is*: identity, origin, time, and lasting traits.",
        "- **Estar** is for how or where something *is*: location, conditions, and results of a change.",
        "",
        "Compare *Es aburrido* (he is boring) with *Está aburrido* (he is bored).",
      ].join("\n"),
    ),
    userMessage("run-2", "Give me three example sentences for each.", "2026-10-27T18:02:40.000Z"),
    assistantMessage(
      "run-2",
      [
        "**Ser**",
        "",
        "1. Soy de Valencia.",
        "2. La reunión es a las tres.",
        "3. Mi hermana es médica.",
        "",
        "**Estar**",
        "",
        "1. Estoy en la biblioteca.",
        "2. La sopa está fría.",
        "3. Estamos cansados después del viaje.",
      ].join("\n"),
    ),
  ],
  runs: {
    "run-1": successRun("run-1", "2026-10-27T18:00:01.000Z", 6, 1800),
    "run-2": successRun("run-2", "2026-10-27T18:02:41.000Z", 4, 2600),
  },
  activeRunId: null,
  dismissedRunErrorId: null,
  profileId: SAMPLE_AI_PROFILE.id,
  modelId: SAMPLE_AI_MODELS[0].id,
  modelParameters: {},
  lastReadRunId: "run-2",
  promptInput: "",
};

// WHY: a null message `parts` and an unknown run status each fail restore, so the chat shows the recovery
// screen with both issues under its details.
const brokenState = {
  ...normalState,
  id: BROKEN_ID,
  messages: [{ ...normalState.messages[0], parts: null }],
  runs: { "run-1": { ...normalState.runs["run-1"], status: "finished" } },
  lastReadRunId: "run-1",
};

const PROPOSED_CARDS = [
  ["tener (yo)", "tuve"],
  ["poder (él)", "pudo"],
  ["decir (nosotros)", "dijimos"],
  ["hacer (ellos)", "hicieron"],
  ["venir (tú)", "viniste"],
  ["traer (yo)", "traje"],
];

const PROPOSE_PROMPT = "Make me cards for irregular preterite verbs in my Spanish deck. Skip ones I already have.";

// WHY: one turn with every activity kind — a thought, list and read tools, a failed tool, and propose_cards.
// The table rows cover each restorable card status: added, failed, and not yet added.
const cardsState = {
  ...normalState,
  id: CARDS_ID,
  createdAt: "2026-10-28T09:10:00.000Z",
  updatedAt: "2026-10-28T09:10:40.000Z",
  messages: [
    userMessage("run-1", PROPOSE_PROMPT, "2026-10-28T09:10:00.000Z"),
    assistantMessage(
      "run-1",
      "I added six preterite forms. I skipped *ir (yo) → fui*, which is already in **Spanish irregular verbs**.",
    ),
  ],
  runs: {
    "run-1": {
      ...successRun("run-1", "2026-10-28T09:10:01.000Z", 38, 9400),
      cards: PROPOSED_CARDS.map(([front, back]) => ({
        content: { [FRONT_FIELD.id]: { text: front }, [BACK_FIELD.id]: { text: back } },
      })),
      cardStatuses: { 0: "success", 1: "success", 2: "error" },
      templateFields: TEMPLATE_FIELDS,
      writeTargetDeckId: SPANISH_DECK_ID,
      writeTargetTemplateId: SAMPLE_TEMPLATE.id,
      toolCalls: [
        {
          kind: "reasoning",
          id: "run-1-reasoning-1",
          text: "The user wants new **preterite** cards. Find the Spanish deck, read its cards, then propose the missing forms.",
          status: "done",
          startedAt: "2026-10-28T09:10:01.000Z",
          elapsedSeconds: 3,
        },
        {
          id: "call-1",
          name: "list_decks",
          input: {},
          status: "success",
          output: {
            decks: [
              {
                deckId: "0199a1b0-0000-7000-8000-000000000001",
                title: "Japanese vocabulary N5",
                cardCount: 61,
                templateTitle: "Basic",
                fieldTitles: ["Front", "Back"],
              },
              {
                deckId: SPANISH_DECK_ID,
                title: "Spanish irregular verbs",
                cardCount: 17,
                templateTitle: "Basic",
                fieldTitles: ["Front", "Back"],
              },
              {
                deckId: "0199a1b0-0000-7000-8000-000000000003",
                title: "World capitals",
                cardCount: 12,
                templateTitle: "Basic",
                fieldTitles: ["Front", "Back"],
              },
            ],
          },
          startedAt: "2026-10-28T09:10:04.000Z",
          elapsedSeconds: 1,
        },
        {
          id: "call-2",
          name: "get_template",
          input: { templateId: "basic" },
          status: "error",
          error: "Template not found: basic",
          startedAt: "2026-10-28T09:10:06.000Z",
          elapsedSeconds: 0,
        },
        {
          id: "call-3",
          name: "get_deck_cards",
          input: { deckId: SPANISH_DECK_ID },
          status: "success",
          output: {
            deckTitle: "Spanish irregular verbs",
            totalCards: 17,
            isCapped: false,
            cards: [
              { fields: { Front: "ser (yo)", Back: "fui" } },
              { fields: { Front: "ir (yo)", Back: "fui" } },
              { fields: { Front: "estar (ella)", Back: "estuvo" } },
            ],
          },
          startedAt: "2026-10-28T09:10:07.000Z",
          elapsedSeconds: 1,
        },
        {
          id: "call-4",
          name: "propose_cards",
          input: {
            deckId: SPANISH_DECK_ID,
            cards: [...PROPOSED_CARDS, ["ir (yo)", "fui"]].map(([Front, Back]) => ({ fields: { Front, Back } })),
          },
          status: "success",
          output: {
            deckId: SPANISH_DECK_ID,
            deckTitle: "Spanish irregular verbs",
            templateId: SAMPLE_TEMPLATE.id,
            templateFields: TEMPLATE_FIELDS,
            cards: PROPOSED_CARDS.map(([Front, Back]) => ({ fields: { Front, Back } })),
            rejectedCount: 1,
          },
          startedAt: "2026-10-28T09:10:12.000Z",
          elapsedSeconds: 22,
        },
      ],
    },
  },
  lastReadRunId: "run-1",
};

export const SAMPLE_CONVERSATIONS: Conversation[] = [
  {
    id: CARDS_ID,
    title: PROPOSE_PROMPT,
    state: cardsState,
    createdAt: new Date(cardsState.createdAt),
    updatedAt: new Date(cardsState.updatedAt),
  },
  {
    id: NORMAL_ID,
    // WHY: a save recomputes the title from the first prompt, so the sample title matches it.
    title: "What's the difference between ser and estar?",
    state: normalState,
    createdAt: new Date(normalState.createdAt),
    updatedAt: new Date(normalState.updatedAt),
  },
  {
    id: BROKEN_ID,
    title: "When do I use wa and when ga?",
    state: brokenState,
    createdAt: new Date("2026-10-26T12:00:00.000Z"),
    updatedAt: new Date("2026-10-26T12:05:00.000Z"),
  },
];
