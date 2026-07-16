import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { TestDb } from "../test/test-helpers";
import { createTestDb, seedDeckContext } from "../test/test-helpers";
import { deleteDeck, getDeck, getDecks, updateDeck } from "./decks";

describe("decks repository integration", () => {
  let testDb: TestDb;

  beforeEach(async () => {
    testDb = await createTestDb();
  });

  afterEach(async () => {
    await testDb.close();
  });

  it("round-trips deck create, read, update, and delete", async () => {
    const { db } = testDb;
    const { deck, algorithm, template } = await seedDeckContext(db, { deck: { title: "Original" } });

    expect(await getDeck(db, deck.id)).toMatchObject({
      id: deck.id,
      title: "Original",
      algorithmId: algorithm.id,
      templateId: template.id,
    });
    expect(await getDecks(db)).toHaveLength(1);

    const updated = await updateDeck(db, {
      id: deck.id,
      values: {
        title: "Renamed",
        algorithmId: algorithm.id,
        templateId: template.id,
      },
    });

    expect(updated).toMatchObject({ id: deck.id, title: "Renamed" });
    expect(await getDeck(db, deck.id)).toMatchObject({ title: "Renamed" });

    await deleteDeck(db, { id: deck.id });

    expect(await getDeck(db, deck.id)).toBeNull();
    expect(await getDecks(db)).toEqual([]);
  });

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
});
