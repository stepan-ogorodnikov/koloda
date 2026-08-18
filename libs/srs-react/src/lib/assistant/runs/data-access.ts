import type { Deck } from "@koloda/srs";

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

/** Per-run record of what a historical request carried; persisted with the run. */
export type DataAccessManifest = {
  decks: DataAccessDeckSummary[];
  /** Null on chat runs — chat never includes card contents. */
  writeTarget: DataAccessWriteTarget | null;
};

/**
 * Restore-only snapshot on `GenerationRun`. New submits do not resolve or inject
 * this; a stored value is inert metadata. Malformed persisted values fail as corrupt.
 */
export type DataAccessSnapshot = {
  context: string;
  manifest: DataAccessManifest;
};
