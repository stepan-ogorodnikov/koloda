import type { InterfaceSettings } from "@koloda/app";
import { AppError, DEFAULT_INTERFACE_SETTINGS, interfaceSettingsValidation } from "@koloda/app";
import { DEFAULT_HOTKEYS_SETTINGS, hotkeysSettingsValidation } from "@koloda/app";
import { DEFAULT_LEARNING_SETTINGS, learningSettingsValidation } from "@koloda/app";
import {
  addAlgorithm,
  addCards,
  addDeck,
  addTemplate,
  applyPendingMigrations,
  ensureMigrationsTable,
  getStatus as getDbStatus,
  setSettings,
} from "@koloda/db-sqlite";
import { db } from "./db";
import { loadSeedData, WEB_SEED_ALGORITHM_IDS, WEB_SEED_TEMPLATE_IDS, webSeedCardContent } from "./seed/seed";

export async function getStatus() {
  return getDbStatus(db);
}

type SetupFromScratchData = Partial<InterfaceSettings>;

// WHY: one transaction — an interrupted setup rolls back migrations too, so status stays "blank".
export async function setupFromScratch(settings: SetupFromScratchData) {
  await ensureMigrationsTable(db);
  const seed = await loadSeedData(settings.language ?? "en");

  await db.transaction(async (tx) => {
    await applyPendingMigrations(tx);

    const algorithmIds = new Map<string, string>();
    for (const algorithm of seed.algorithms) {
      const returning = await addAlgorithm(
        tx,
        { title: algorithm.title, content: algorithm.content },
        WEB_SEED_ALGORITHM_IDS[algorithm.id],
      );
      if (!returning?.id) throw new AppError("db.add");
      algorithmIds.set(algorithm.id, returning.id);
    }

    const templateIds = new Map<string, string>();
    for (const template of seed.templates) {
      const returning = await addTemplate(
        tx,
        { title: template.title, content: template.content },
        WEB_SEED_TEMPLATE_IDS[template.id],
      );
      if (!returning?.id) throw new AppError("db.add");
      templateIds.set(template.id, returning.id);
    }

    const algorithm = algorithmIds.get("simple");
    const template = templateIds.get("type");
    if (!algorithm || !template) throw new AppError("db.add");

    await setSettings(tx, {
      name: "interface",
      content: interfaceSettingsValidation.parse({ ...DEFAULT_INTERFACE_SETTINGS, ...settings }),
    });
    await setSettings(tx, {
      name: "learning",
      content: learningSettingsValidation.parse({ ...DEFAULT_LEARNING_SETTINGS, defaults: { algorithm, template } }),
    });
    await setSettings(tx, {
      name: "hotkeys",
      content: hotkeysSettingsValidation.parse(DEFAULT_HOTKEYS_SETTINGS),
    });

    for (const sample of seed.decks) {
      const algorithmId = algorithmIds.get(sample.algorithm);
      const templateId = templateIds.get(sample.template);
      if (!algorithmId || !templateId) throw new AppError("db.add");

      const deck = await addDeck(tx, { title: sample.title, algorithmId, templateId });
      if (!deck?.id) throw new AppError("db.add");

      const results = await addCards(
        tx,
        sample.cards.map((card) => ({
          deckId: deck.id,
          templateId,
          content: webSeedCardContent(sample.template, card),
        })),
      );
      if (results.some((result) => result.error)) throw new AppError("db.add");
    }
  });
}
