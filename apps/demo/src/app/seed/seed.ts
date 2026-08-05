import type { AlgorithmFSRS } from "@koloda/srs";
import type { InsertTemplateData } from "@koloda/srs";

export type DemoSeedTemplateId = "type" | "reveal";
export type DemoSeedAlgorithmId = "simple" | "complex";

export type DemoSeedTemplate = {
  id: DemoSeedTemplateId;
  title: string;
  content: InsertTemplateData["content"];
};

export type DemoSeedAlgorithm = {
  id: DemoSeedAlgorithmId;
  title: string;
  content: AlgorithmFSRS;
};

export type DemoSeedCard = {
  front: string;
  back: string;
};

export type DemoSeedDeck = {
  title: string;
  template: DemoSeedTemplateId;
  algorithm: DemoSeedAlgorithmId;
  cards: DemoSeedCard[];
};

export type DemoSeed = {
  templates: DemoSeedTemplate[];
  algorithms: DemoSeedAlgorithm[];
  decks: DemoSeedDeck[];
};

export async function loadSeedData(locale: string): Promise<DemoSeed> {
  switch (locale) {
    case "ru":
      return (await import("./ru")).demoSeed;
    default:
      return (await import("./en")).demoSeed;
  }
}
