import { SEED_ALGORITHM_SIMPLE_ID } from "@koloda/app";
import { DEFAULT_FSRS_ALGORITHM } from "@koloda/srs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { TestDb } from "../test/test-helpers";
import { createTestDb, MISSING_ID, seedAlgorithm, seedDeckContext } from "../test/test-helpers";
import {
  addAlgorithm,
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

  it("inserts a caller-provided id", async () => {
    const { db } = testDb;
    const algorithm = await addAlgorithm(
      db,
      { title: "Seeded", content: DEFAULT_FSRS_ALGORITHM },
      SEED_ALGORITHM_SIMPLE_ID,
    );

    expect(algorithm.id).toBe(SEED_ALGORITHM_SIMPLE_ID);
    expect(await getAlgorithm(db, SEED_ALGORITHM_SIMPLE_ID)).toMatchObject({ title: "Seeded" });
  });

  it("rejects cloning when the source algorithm is missing", async () => {
    const { db } = testDb;

    await expect(cloneAlgorithm(db, { title: "Clone", sourceId: MISSING_ID })).rejects.toMatchObject({
      code: "not-found.algorithms.clone.source",
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

    await expect(deleteAlgorithm(db, { id: algorithm.id, successorId: MISSING_ID })).rejects.toMatchObject({
      code: "not-found.algorithms.delete.successor",
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
