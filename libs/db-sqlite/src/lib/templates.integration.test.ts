import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { addCard } from "./cards";
import { addTemplate, deleteTemplate, getTemplate, updateTemplate } from "./templates";
import type { TestDb } from "../test/test-helpers";
import {
  createCardContent,
  createTestDb,
  MISSING_ID,
  seedDeckContext,
  seedLearningSettings,
  seedTemplate,
} from "../test/test-helpers";

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

    const frontId = template.content.fields[0]!.id;

    await expect(
      updateTemplate(db, {
        id: template.id,
        values: {
          title: template.title,
          content: {
            ...template.content,
            fields: template.content.fields.map((field) =>
              field.id === frontId ? { ...field, type: "markdown" as const } : field,
            ),
          },
        },
      }),
    ).rejects.toMatchObject({
      code: "validation.templates.update-locked",
    });

    const storedTemplate = await getTemplate(db, template.id);
    expect(storedTemplate?.content.fields.find((field) => field.id === frontId)?.type).toBe("text");
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
      code: "validation.templates.delete-locked",
    });
  });

  it("rejects deleting the learning-default template", async () => {
    const { db } = testDb;
    const { algorithm } = await seedDeckContext(db);
    const defaultTemplate = await seedTemplate(db, { title: "Default" });
    await seedTemplate(db, { title: "Other" });
    await seedLearningSettings(db, { algorithm: algorithm.id, template: defaultTemplate.id });

    await expect(deleteTemplate(db, { id: defaultTemplate.id })).rejects.toMatchObject({
      code: "validation.templates.delete-default",
    });

    expect(await getTemplate(db, defaultTemplate.id)).not.toBeNull();
  });

  it("allows deleting a former default template after the default moves elsewhere", async () => {
    const { db } = testDb;
    const { algorithm } = await seedDeckContext(db);
    const formerDefault = await seedTemplate(db, { title: "Old" });
    const newDefault = await seedTemplate(db, { title: "New" });
    await seedLearningSettings(db, { algorithm: algorithm.id, template: newDefault.id });

    await deleteTemplate(db, { id: formerDefault.id });

    expect(await getTemplate(db, formerDefault.id)).toBeNull();
  });

  it("rejects adding a template whose layout references an unknown field", async () => {
    const { db } = testDb;
    const { content } = await seedTemplate(db);

    await expect(
      addTemplate(db, {
        title: "Broken layout",
        content: {
          fields: content.fields.map((field) => ({ ...field })),
          layout: content.layout.map((item) => ({ ...item, field: MISSING_ID })),
        },
      }),
    ).rejects.toThrow();
  });
});
