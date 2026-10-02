import { SEED_ALGORITHM_SIMPLE_ID } from "@koloda/app";
import { DEFAULT_FSRS_ALGORITHM } from "@koloda/srs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { TestDb } from "../test/test-helpers";
import {
  createTestDb,
  MISSING_ID,
  seedAlgorithm,
  seedDeckContext,
  seedLearningSettings,
  seedTemplate,
} from "../test/test-helpers";
import {
  addAlgorithm,
  cloneAlgorithm,
  deleteAlgorithm,
  getAlgorithm,
  getAlgorithmDecks,
  getAlgorithms,
  updateAlgorithm,
} from "./algorithms";
import type { DB } from "./db";
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

  it("rejects adding an algorithm that fails content validation", async () => {
    const { db } = testDb;
    const seeded = await seedAlgorithm(db);

    await expect(
      addAlgorithm(db, { title: "Bad", content: { ...DEFAULT_FSRS_ALGORITHM, retention: 50 } }),
    ).rejects.toThrow();

    expect(await getAlgorithms(db)).toEqual([seeded]);
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
    await seedAlgorithm(db, { title: "Remaining" });

    await deleteAlgorithm(db, { id: algorithm.id });

    expect(await getAlgorithm(db, algorithm.id)).toBeNull();
    expect(await getAlgorithmDecks(db, algorithm.id)).toEqual([]);
  });

  it("rejects deleting the learning-default algorithm", async () => {
    const { db } = testDb;
    const algorithm = await seedAlgorithm(db);
    await seedAlgorithm(db, { title: "Other" });
    const template = await seedTemplate(db);
    await seedLearningSettings(db, { algorithm: algorithm.id, template: template.id });

    await expect(deleteAlgorithm(db, { id: algorithm.id })).rejects.toMatchObject({
      code: "validation.algorithms.delete-default",
    });

    expect(await getAlgorithm(db, algorithm.id)).not.toBeNull();
  });

  it("rejects deleting the last remaining algorithm", async () => {
    const { db } = testDb;
    const algorithm = await seedAlgorithm(db);

    await expect(deleteAlgorithm(db, { id: algorithm.id })).rejects.toMatchObject({
      code: "validation.algorithms.delete-last",
    });

    expect(await getAlgorithm(db, algorithm.id)).not.toBeNull();
  });

  it("allows deleting a former default after the default moves elsewhere", async () => {
    const { db } = testDb;
    const formerDefault = await seedAlgorithm(db, { title: "Old" });
    const newDefault = await seedAlgorithm(db, { title: "New" });
    const template = await seedTemplate(db);
    await seedLearningSettings(db, { algorithm: newDefault.id, template: template.id });

    await deleteAlgorithm(db, { id: formerDefault.id });

    expect(await getAlgorithm(db, formerDefault.id)).toBeNull();
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
    await seedAlgorithm(db, { title: "Other" });

    await expect(deleteAlgorithm(db, { id: algorithm.id, successorId: MISSING_ID })).rejects.toMatchObject({
      code: "not-found.algorithms.delete.successor",
    });

    expect(await getAlgorithm(db, algorithm.id)).not.toBeNull();
  });

  it("rejects deleting a referenced algorithm with itself as the successor", async () => {
    const { db } = testDb;
    const { algorithm, deck } = await seedDeckContext(db);
    await seedAlgorithm(db, { title: "Other" });

    await expect(deleteAlgorithm(db, { id: algorithm.id, successorId: algorithm.id })).rejects.toMatchObject({
      code: "not-found.algorithms.delete.successor",
    });

    expect(await getAlgorithm(db, algorithm.id)).not.toBeNull();
    expect(await getAlgorithmDecks(db, algorithm.id)).toEqual([{ id: deck.id, title: deck.title }]);
  });

  it("fails closed when the stored learning settings row is invalid", async () => {
    const { db } = testDb;
    const algorithm = await seedAlgorithm(db);
    await seedAlgorithm(db, { title: "Other" });

    // Valid JSON, invalid schema — a present-but-invalid row must not read as "absent".
    await db.run("INSERT INTO settings (name, content, created_at) VALUES (?, ?, ?)", [
      "learning",
      JSON.stringify({ dayStartsAt: 42 }),
      Date.now(),
    ]);

    await expect(deleteAlgorithm(db, { id: algorithm.id })).rejects.toMatchObject({ code: "db.get" });
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

  describe("revisions", () => {
    async function getRevisions(db: DB, algorithmId: string) {
      const rows = await db.all(
        "SELECT algorithm_id, content, actor, created_at FROM algorithm_revisions WHERE algorithm_id = ? ORDER BY created_at, id",
        [algorithmId],
      );
      return rows.map((row) => ({
        algorithmId: row.algorithm_id,
        content: JSON.parse(String(row.content)),
        actor: row.actor,
        createdAt: Number(row.created_at),
      }));
    }

    it("records the starting parameters when an algorithm is added", async () => {
      const { db } = testDb;
      const content = { ...DEFAULT_FSRS_ALGORITHM, retention: 85 };

      const algorithm = await addAlgorithm(db, { title: "Added", content });

      // Actor JSON is a wire contract shared with Rust.
      expect(await getRevisions(db, algorithm.id)).toEqual([
        { algorithmId: algorithm.id, content, actor: '{"kind":"user"}', createdAt: algorithm.createdAt.getTime() },
      ]);
    });

    it("starts a clone's history with its own revision and leaves the source's alone", async () => {
      const { db } = testDb;
      const source = await seedAlgorithm(db, { content: { ...DEFAULT_FSRS_ALGORITHM, retention: 85 } });

      const cloned = await cloneAlgorithm(db, { title: "Clone", sourceId: source.id });

      expect(await getRevisions(db, cloned.id)).toEqual([expect.objectContaining({ content: source.content })]);
      expect(await getRevisions(db, source.id)).toHaveLength(1);
    });

    it("appends a revision with the new parameters when a save changes them", async () => {
      const { db } = testDb;
      const algorithm = await seedAlgorithm(db);
      const content = { ...DEFAULT_FSRS_ALGORITHM, retention: 92 };

      const updated = await updateAlgorithm(db, { id: algorithm.id, values: { title: algorithm.title, content } });

      const revisions = await getRevisions(db, algorithm.id);
      expect(revisions).toHaveLength(2);
      expect(revisions[1]).toEqual({
        algorithmId: algorithm.id,
        content,
        actor: '{"kind":"user"}',
        createdAt: updated.updatedAt?.getTime(),
      });
    });

    it.each([
      { name: "the title only", values: { title: "Renamed" } },
      { name: "the notes only", values: { notes: "Vocabulary" } },
      { name: "nothing", values: {} },
    ])("records nothing when a save changes $name", async ({ values }) => {
      const { db } = testDb;
      const algorithm = await seedAlgorithm(db);

      await updateAlgorithm(db, {
        id: algorithm.id,
        values: { title: algorithm.title, content: algorithm.content, ...values },
      });

      expect(await getRevisions(db, algorithm.id)).toHaveLength(1);
    });

    it("records nothing when a save is rejected", async () => {
      const { db } = testDb;
      const algorithm = await seedAlgorithm(db);

      await expect(
        updateAlgorithm(db, {
          id: algorithm.id,
          values: { title: algorithm.title, content: { ...DEFAULT_FSRS_ALGORITHM, retention: 50 } },
        }),
      ).rejects.toThrow();

      expect(await getRevisions(db, algorithm.id)).toHaveLength(1);
    });

    it("keeps history after the algorithm is deleted", async () => {
      const { db } = testDb;
      const algorithm = await seedAlgorithm(db);
      await seedAlgorithm(db, { title: "Remaining" });

      await deleteAlgorithm(db, { id: algorithm.id });

      expect(await getRevisions(db, algorithm.id)).toHaveLength(1);
    });

    // WHY: first-run setup adds algorithms inside its own transaction; a rolled-back setup must leave no history.
    it("rolls back the revision with an enclosing transaction", async () => {
      const { db } = testDb;
      const rollback = new Error("rollback");

      await expect(
        db.transaction(async (tx) => {
          await addAlgorithm(tx, { title: "Seeded", content: DEFAULT_FSRS_ALGORITHM }, SEED_ALGORITHM_SIMPLE_ID);
          throw rollback;
        }),
      ).rejects.toBe(rollback);

      expect(await getRevisions(db, SEED_ALGORITHM_SIMPLE_ID)).toEqual([]);
    });
  });
});
