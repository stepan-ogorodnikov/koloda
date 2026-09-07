import type { AlgorithmFSRS } from "@koloda/srs";
import type { InsertTemplateData } from "@koloda/srs";

export type WebSeedTemplateId = "type" | "reveal";
export type WebSeedAlgorithmId = "simple" | "complex";

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
