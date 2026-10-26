import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { TestDb } from "../test/test-helpers";
import { createTestDb, MISSING_ID, seedAlgorithm, seedDeckContext, seedTemplate } from "../test/test-helpers";
import { addDeck, getDeck, getDecks, updateDeck } from "./decks";

describe("decks repository integration", () => {
  let testDb: TestDb;

  beforeEach(async () => {
    testDb = await createTestDb();
  });

  afterEach(async () => {
    await testDb.close();
  });

  // Twin of `update_deck_round_trips_every_field` in `crates/koloda/tests/integration/decks_integration_tests.rs`.
  it("round-trips every deck field through an update, and clears notes", async () => {
    const { db } = testDb;
    const { deck } = await seedDeckContext(db, { deck: { title: "Original" } });
    const otherAlgorithm = await seedAlgorithm(db, { title: "Other FSRS" });
    const otherTemplate = await seedTemplate(db, { title: "Other" });
    const values = { title: "Renamed", algorithmId: otherAlgorithm.id, templateId: otherTemplate.id };

    await updateDeck(db, { id: deck.id, values: { ...values, notes: "Deck notes" } });
    const stored = await getDeck(db, deck.id);

    expect(stored?.updatedAt).toBeInstanceOf(Date);
    expect(stored).toEqual({
      id: deck.id,
      ...values,
      notes: "Deck notes",
      createdAt: deck.createdAt,
      updatedAt: stored?.updatedAt,
    });

    await updateDeck(db, { id: deck.id, values: { ...values, notes: "" } });

    expect((await getDeck(db, deck.id))?.notes).toBeUndefined();
  });

  // WHY: the title rule itself lives in `libs/srs` (`titles.test.ts`); this checks that the repo
  // rejects before it writes, so the saved deck is unchanged.
  it("rejects deck updates with an empty title", async () => {
    const { db } = testDb;
    const { deck, algorithm, template } = await seedDeckContext(db);

    await expect(
      updateDeck(db, {
        id: deck.id,
        values: {
          title: "",
          algorithmId: algorithm.id,
          templateId: template.id,
        },
      }),
    ).rejects.toMatchObject({
      issues: expect.arrayContaining([
        expect.objectContaining({
          message: "validation.common.title.too-short",
          path: ["title"],
        }),
      ]),
    });

    expect(await getDeck(db, deck.id)).toMatchObject({ title: deck.title });
  });

  it("stores deck titles without leading or trailing whitespace", async () => {
    const { db } = testDb;
    const { algorithm, template } = await seedDeckContext(db);

    const deck = await addDeck(db, {
      title: "  Trimmed deck  ",
      algorithmId: algorithm.id,
      templateId: template.id,
    });

    expect(deck.title).toBe("Trimmed deck");
    expect(await getDeck(db, deck.id)).toMatchObject({ title: "Trimmed deck" });
  });

  // WHY: the assistant refreshes deck caches when a run ends mid add_deck, and
  // that refetch must not cache the list from before the insert.
  it("completes an add before a read issued while the add is running", async () => {
    const { db } = testDb;
    const { algorithm, template } = await seedDeckContext(db, { deck: { title: "Seeded" } });

    const adding = addDeck(db, { title: "Spanish", algorithmId: algorithm.id, templateId: template.id });
    const reading = getDecks(db);

    expect((await reading).map((deck) => deck.title)).toEqual(expect.arrayContaining(["Seeded", "Spanish"]));
    await adding;
  });

  it("rejects add/update when algorithm or template is missing", async () => {
    const { db } = testDb;
    const { deck, algorithm, template } = await seedDeckContext(db);

    await expect(
      addDeck(db, {
        title: "Bad algorithm",
        algorithmId: MISSING_ID,
        templateId: template.id,
      }),
    ).rejects.toMatchObject({ code: "not-found.decks.add.algorithm" });

    await expect(
      addDeck(db, {
        title: "Bad template",
        algorithmId: algorithm.id,
        templateId: MISSING_ID,
      }),
    ).rejects.toMatchObject({ code: "not-found.decks.add.template" });

    await expect(
      updateDeck(db, {
        id: MISSING_ID,
        values: {
          title: "Missing deck",
          algorithmId: algorithm.id,
          templateId: template.id,
        },
      }),
    ).rejects.toMatchObject({ code: "not-found.decks.update.deck" });

    await expect(
      updateDeck(db, {
        id: deck.id,
        values: {
          title: "Bad algorithm",
          algorithmId: MISSING_ID,
          templateId: template.id,
        },
      }),
    ).rejects.toMatchObject({ code: "not-found.decks.update.algorithm" });

    await expect(
      updateDeck(db, {
        id: deck.id,
        values: {
          title: "Bad template",
          algorithmId: algorithm.id,
          templateId: MISSING_ID,
        },
      }),
    ).rejects.toMatchObject({ code: "not-found.decks.update.template" });

    expect(await getDeck(db, deck.id)).toMatchObject({
      title: deck.title,
      algorithmId: algorithm.id,
      templateId: template.id,
    });
  });
});
