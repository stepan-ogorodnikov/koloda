import {
  SEED_ALGORITHM_COMPLEX_ID,
  SEED_ALGORITHM_SIMPLE_ID,
  SEED_TEMPLATE_REVEAL_BACK_FIELD_ID,
  SEED_TEMPLATE_REVEAL_FRONT_FIELD_ID,
  SEED_TEMPLATE_REVEAL_ID,
  SEED_TEMPLATE_TYPE_BACK_FIELD_ID,
  SEED_TEMPLATE_TYPE_FRONT_FIELD_ID,
  SEED_TEMPLATE_TYPE_ID,
} from "@koloda/app";
import type { AlgorithmFSRS } from "@koloda/srs";
import type { InsertTemplateData } from "@koloda/srs";

export type WebSeedTemplateId = "type" | "reveal";
export type WebSeedAlgorithmId = "simple" | "complex";

export const WEB_SEED_ALGORITHM_IDS: Record<WebSeedAlgorithmId, string> = {
  simple: SEED_ALGORITHM_SIMPLE_ID,
  complex: SEED_ALGORITHM_COMPLEX_ID,
};

export const WEB_SEED_TEMPLATE_IDS: Record<WebSeedTemplateId, string> = {
  type: SEED_TEMPLATE_TYPE_ID,
  reveal: SEED_TEMPLATE_REVEAL_ID,
};

export function webSeedCardContent(template: WebSeedTemplateId, card: WebSeedCard): Record<string, { text: string }> {
  if (template === "reveal") {
    return {
      [SEED_TEMPLATE_REVEAL_FRONT_FIELD_ID]: { text: card.front },
      [SEED_TEMPLATE_REVEAL_BACK_FIELD_ID]: { text: card.back },
    };
  }
  return {
    [SEED_TEMPLATE_TYPE_FRONT_FIELD_ID]: { text: card.front },
    [SEED_TEMPLATE_TYPE_BACK_FIELD_ID]: { text: card.back },
  };
}

export type WebSeedTemplate = {
  id: WebSeedTemplateId;
  title: string;
  content: InsertTemplateData["content"];
};

export type WebSeedAlgorithm = {
  id: WebSeedAlgorithmId;
  title: string;
  content: AlgorithmFSRS;
};

export type WebSeedCard = {
  front: string;
  back: string;
};

export type WebSeedDeck = {
  title: string;
  template: WebSeedTemplateId;
  algorithm: WebSeedAlgorithmId;
  cards: WebSeedCard[];
};

export type WebSeed = {
  templates: WebSeedTemplate[];
  algorithms: WebSeedAlgorithm[];
  decks: WebSeedDeck[];
};

export async function loadSeedData(locale: string): Promise<WebSeed> {
  switch (locale) {
    case "ru":
      return (await import("./ru")).webSeed;
    default:
      return (await import("./en")).webSeed;
  }
}
