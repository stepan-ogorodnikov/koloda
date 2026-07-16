import { DEFAULT_FSRS_ALGORITHM } from "@koloda/srs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { TestDb } from "../test/test-helpers";
import { createTestDb, seedAlgorithm, seedDeckContext } from "../test/test-helpers";
import {
  cloneAlgorithm,
  deleteAlgorithm,
  getAlgorithm,
  getAlgorithmDecks,
  getAlgorithms,
  updateAlgorithm,
} from "./algorithms";
import { getDeck } from "./decks";

describe("algorithms repository integration", () => {
  let testDb: TestDb;

  beforeEach(async () => {
    testDb = await createTestDb();
  });

  afterEach(async () => {
    await testDb.close();
  });

  it("clones an algorithm with a new title and the same content", async () => {
    const { db } = testDb;
    const source = await seedAlgorithm(db, {
      title: "Source",
      content: { ...DEFAULT_FSRS_ALGORITHM, retention: 85 },
    });

    const cloned = await cloneAlgorithm(db, { title: "Clone", sourceId: source.id });

    expect(cloned).toMatchObject({
      title: "Clone",
      content: source.content,
    });
    expect(cloned.id).not.toBe(source.id);
    expect(await getAlgorithms(db)).toHaveLength(2);
  });

  it("rejects cloning when the source algorithm is missing", async () => {
    const { db } = testDb;

    await expect(cloneAlgorithm(db, { title: "Clone", sourceId: 999 })).rejects.toMatchObject({
      code: "db.clone",
      details: "not-found.algorithms.clone.source",
    });
  });

  it("deletes an unused algorithm", async () => {
    const { db } = testDb;
    const algorithm = await seedAlgorithm(db);

    await deleteAlgorithm(db, { id: algorithm.id });

    expect(await getAlgorithm(db, algorithm.id)).toBeNull();
    expect(await getAlgorithmDecks(db, algorithm.id)).toEqual([]);
  });

  it("reassigns decks to a successor before deleting a referenced algorithm", async () => {
    const { db } = testDb;
    const { algorithm, deck } = await seedDeckContext(db);
    const successor = await seedAlgorithm(db, { title: "Successor" });

    expect(await getAlgorithmDecks(db, algorithm.id)).toEqual([{ id: deck.id, title: deck.title }]);

    await deleteAlgorithm(db, { id: algorithm.id, successorId: successor.id });

    expect(await getAlgorithm(db, algorithm.id)).toBeNull();
    expect(await getDeck(db, deck.id)).toMatchObject({ id: deck.id, algorithmId: successor.id });
    expect(await getAlgorithmDecks(db, successor.id)).toEqual([{ id: deck.id, title: deck.title }]);
  });

  it("rejects deleting a referenced algorithm without a valid successor", async () => {
    const { db } = testDb;
    const { algorithm } = await seedDeckContext(db);

    await expect(deleteAlgorithm(db, { id: algorithm.id, successorId: 999 })).rejects.toMatchObject({
      code: "db.delete",
      details: "not-found.algorithms.delete.successor",
    });

    expect(await getAlgorithm(db, algorithm.id)).not.toBeNull();
  });

  it("updates algorithm title and content", async () => {
    const { db } = testDb;
    const algorithm = await seedAlgorithm(db);

    const updated = await updateAlgorithm(db, {
      id: algorithm.id,
      values: {
        title: "Updated",
        content: { ...DEFAULT_FSRS_ALGORITHM, retention: 92, isFuzzEnabled: false },
      },
    });

    expect(updated).toMatchObject({
      id: algorithm.id,
      title: "Updated",
      content: {
        retention: 92,
        isFuzzEnabled: false,
      },
    });
  });
});
