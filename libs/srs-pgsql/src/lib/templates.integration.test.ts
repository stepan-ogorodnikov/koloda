import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { addCard } from "./cards";
import { deleteTemplate, getTemplate, updateTemplate } from "./templates";
import type { TestDb } from "../test/test-helpers";
import { createCardContent, createTestDb, seedDeckContext } from "../test/test-helpers";

describe("templates repository integration", () => {
  let testDb: TestDb;

  beforeEach(async () => {
    testDb = await createTestDb();
  });

  afterEach(async () => {
    await testDb.close();
  });

  it("marks a template as locked after cards exist for it", async () => {
    const { db } = testDb;
    const { deck, template } = await seedDeckContext(db);

    expect((await getTemplate(db, template.id))?.isLocked).toBe(false);

    await addCard(db, {
      deckId: deck.id,
      templateId: template.id,
      content: createCardContent(template),
    });

    expect((await getTemplate(db, template.id))?.isLocked).toBe(true);
  });

  it("allows safe updates like title changes on locked templates", async () => {
    const { db } = testDb;
    const { deck, template } = await seedDeckContext(db);

    await addCard(db, {
      deckId: deck.id,
      templateId: template.id,
      content: createCardContent(template),
    });

    const updatedTemplate = await updateTemplate(db, {
      id: template.id,
      values: {
        title: "Updated Template Title",
        content: template.content,
      },
    });

    expect(updatedTemplate).toMatchObject({
      id: template.id,
      title: "Updated Template Title",
      isLocked: true,
    });
  });

  it("rejects protected field changes on locked templates", async () => {
    const { db } = testDb;
    const { deck, template } = await seedDeckContext(db);

    await addCard(db, {
      deckId: deck.id,
      templateId: template.id,
      content: createCardContent(template),
    });

    await expect(updateTemplate(db, {
      id: template.id,
      values: {
        title: template.title,
        content: {
          ...template.content,
          fields: template.content.fields.map((field) => (
            field.id === 1 ? { ...field, type: "markdown" as const } : field
          )),
        },
      },
    })).rejects.toMatchObject({
      code: "db.update",
      details: "validation.templates.update-locked",
    });

    const storedTemplate = await getTemplate(db, template.id);
    expect(storedTemplate?.content.fields.find((field) => field.id === 1)?.type).toBe("text");
  });

  it("prevents deleting locked templates", async () => {
    const { db } = testDb;
    const { deck, template } = await seedDeckContext(db);

    await addCard(db, {
      deckId: deck.id,
      templateId: template.id,
      content: createCardContent(template),
    });

    await expect(deleteTemplate(db, { id: template.id })).rejects.toMatchObject({
      code: "db.delete",
      details: "validation.templates.delete-locked",
    });
  });
});
