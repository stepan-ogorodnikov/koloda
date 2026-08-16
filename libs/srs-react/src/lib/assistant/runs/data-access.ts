import type { Card, Deck, Template, TemplateField } from "@koloda/srs";

// WHY: hard card cap bounds serialization work and prompt growth before character
// accounting starts; the count line keeps the true deck size visible to the model.
export const DATA_ACCESS_MAX_CARDS_PER_DECK = 200;

// WHY: character ceiling keeps the injected card list near ~2k tokens, so data access
// never crowds out the conversation in smaller context windows.
export const DATA_ACCESS_CARD_LIST_CHAR_BUDGET = 8_000;

/** Structural template subset; field order matters — the first field is the card front. */
export type DataAccessTemplate = Pick<Template, "id" | "title"> & {
  content: { fields: Array<Pick<TemplateField, "id" | "title">> };
};

/** Deck summary source: real deck fields plus the card count resolved by the caller. */
export type DataAccessDeckSummaryInput = Pick<Deck, "id" | "title" | "templateId"> & { cardCount: number };

/** Structural card subset — only content is serialized; FSRS state never leaves the machine. */
export type DataAccessCard = Pick<Card, "content">;

/** Write-target source: deck fields plus its template (subset of `DeckWithTemplate`). */
export type DataAccessDeckCardsInput = Pick<Deck, "id" | "title"> & { template: DataAccessTemplate };

export type DataAccessDeckSummary = {
  deckId: Deck["id"];
  title: string;
  cardCount: number;
  /** Null when the deck's template was not among the resolved templates. */
  templateTitle: string | null;
};

export type DataAccessWriteTarget =
  | { isMissing: true }
  | {
      isMissing: false;
      deckId: Deck["id"];
      title: string;
      totalCards: number;
      listedCards: number;
      fullFieldCards: number;
      isCapped: boolean;
      isTruncated: boolean;
    };

/** Per-run record of what the request actually carried; persisted with the run. */
export type DataAccessManifest = {
  decks: DataAccessDeckSummary[];
  /** Null on chat runs — chat never includes card contents. */
  writeTarget: DataAccessWriteTarget | null;
};

export type SerializedDeckSummaries = {
  context: string;
  decks: DataAccessDeckSummary[];
};

export type SerializedDeckCards = {
  context: string;
  writeTarget: DataAccessWriteTarget;
};

/** Serialize every deck as a one-line summary (name, card count, template). */
export function serializeDeckSummaries(
  decks: DataAccessDeckSummaryInput[],
  templates: DataAccessTemplate[],
): SerializedDeckSummaries {
  if (decks.length === 0) return { context: "", decks: [] };

  const rows = decks.map((deck) => {
    const template = templates.find((t) => t.id === deck.templateId) ?? null;
    return {
      summary: {
        deckId: deck.id,
        title: deck.title,
        cardCount: deck.cardCount,
        templateTitle: template?.title ?? null,
      },
      line: `- Deck: ${deck.title} — ${deck.cardCount} cards — Template: ${formatTemplateLabel(template)}`,
    };
  });

  return {
    context: ["User decks:", ...rows.map((row) => row.line)].join("\n"),
    decks: rows.map((row) => row.summary),
  };
}

/**
 * Serialize the write-target deck's cards: the count line first, then card fronts,
 * upgraded to full fields while the budget allows. Oversized decks degrade to the
 * capped list — never silence.
 */
export function serializeDeckCards(
  deck: DataAccessDeckCardsInput | null,
  cards: DataAccessCard[],
  budget: number,
): SerializedDeckCards {
  // INVARIANT: a write target deleted before submit resolves to nothing and is
  // recorded as missing — it is never silently dropped from the manifest.
  if (!deck) return { context: "", writeTarget: { isMissing: true } };

  const fields = deck.template.content.fields;
  const capped = cards.slice(0, DATA_ACCESS_MAX_CARDS_PER_DECK);
  const isCapped = cards.length > capped.length;

  const frontLines = capped.map((card) => getCardFront(card, fields[0]));
  const fullLines = capped.map((card) => formatCardFields(card, fields));

  // WHY: the count line is unconditional (a zero-budget deck still yields it) and the
  // trailing notices are metadata, so only card lines count against the budget.
  const listedIndices: number[] = [];
  let usedChars = 0;
  for (const [index, line] of frontLines.entries()) {
    const cost = line.length + (listedIndices.length > 0 ? 1 : 0);
    if (usedChars + cost > budget) break;
    usedChars += cost;
    listedIndices.push(index);
  }

  const fullFieldIndices = new Set<number>();
  for (const index of listedIndices) {
    const cost = fullLines[index].length - frontLines[index].length;
    if (usedChars + cost > budget) break;
    usedChars += cost;
    fullFieldIndices.add(index);
  }

  const listLines = listedIndices.map(
    (index) => `${index + 1}. ${fullFieldIndices.has(index) ? fullLines[index] : frontLines[index]}`,
  );

  const listedCount = listedIndices.length;
  const fullFieldCount = fullFieldIndices.size;
  const isTruncated = listedCount < capped.length || fullFieldCount < listedCount;

  const notices = [
    ...(isCapped ? [`Only the first ${capped.length} of ${cards.length} cards are listed.`] : []),
    ...(listedCount < capped.length
      ? [`Context budget reached: ${listedCount} of ${capped.length} cards listed.`]
      : []),
    ...(listedCount > 0 && fullFieldCount < listedCount
      ? [`Full fields shown for ${fullFieldCount} of ${listedCount} listed cards (context budget).`]
      : []),
  ];

  return {
    context: [`Existing cards in deck ${deck.title} (${cards.length} total):`, ...listLines, ...notices].join("\n"),
    writeTarget: {
      isMissing: false,
      deckId: deck.id,
      title: deck.title,
      totalCards: cards.length,
      listedCards: listedCount,
      fullFieldCards: fullFieldCount,
      isCapped,
      isTruncated,
    },
  };
}

/** The card front is the value of the template's first field. */
function getCardFront(card: DataAccessCard, frontField: Pick<TemplateField, "id" | "title">): string {
  return card.content[String(frontField.id)]?.text ?? "";
}

function formatCardFields(card: DataAccessCard, fields: Array<Pick<TemplateField, "id" | "title">>): string {
  return fields.map((field) => `${field.title}: ${card.content[String(field.id)]?.text ?? ""}`).join(" | ");
}

function formatTemplateLabel(template: DataAccessTemplate | null): string {
  if (!template) return "unknown";
  const fieldTitles = template.content.fields.map((field) => field.title).join(", ");
  return `${template.title} (${fieldTitles})`;
}
