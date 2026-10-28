import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Template, TemplateField } from "@koloda/srs";
import { addCard, deleteCard } from "./cards";
import { cloneTemplate, deleteTemplate, getTemplate, getTemplates, updateTemplate } from "./templates";
import type { TestDb } from "../test/test-helpers";
import {
  createCardContent,
  createTestDb,
  seedDeckContext,
  seedLearningSettings,
  seedTemplate,
} from "../test/test-helpers";

// A shape that differs from the seed in every part, so a dropped or defaulted column shows.
function editedContent(template: Template) {
  const [front, back] = template.content.fields;
  return {
    fields: [{ ...front!, title: "Prompt", type: "markdown" as const, isRequired: false }, back!],
    layout: [
      { field: back!.id, operation: "reveal" as const },
      { field: front!.id, operation: "display" as const },
    ],
  };
}

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

  // Twin of `deleting_the_last_card_unlocks_the_template`
  // in `crates/koloda/tests/integration/templates_integration_tests.rs`.
  it("unlocks a template when its last card is deleted", async () => {
    const { db } = testDb;
    const { deck, template } = await seedDeckContext(db);
    const card = { deckId: deck.id, templateId: template.id, content: createCardContent(template) };
    const first = await addCard(db, card);
    const second = await addCard(db, card);

    await deleteCard(db, { id: first.id });
    expect((await getTemplate(db, template.id))?.isLocked).toBe(true);

    await deleteCard(db, { id: second.id });
    expect((await getTemplate(db, template.id))?.isLocked).toBe(false);
  });

  // Twin of `update_template_round_trips_every_field`
  // in `crates/koloda/tests/integration/templates_integration_tests.rs`.
  it("round-trips every template field through an update", async () => {
    const { db } = testDb;
    const template = await seedTemplate(db);
    const values = { title: "Renamed", notes: "Template notes", content: editedContent(template) };

    await updateTemplate(db, { id: template.id, values });
    const stored = await getTemplate(db, template.id);

    expect(stored?.updatedAt).toBeInstanceOf(Date);
    expect(stored).toEqual({
      id: template.id,
      ...values,
      isLocked: false,
      createdAt: template.createdAt,
      updatedAt: stored?.updatedAt,
    });
  });

  // Twin of `clone_template_copies_fields_and_layout_without_notes_or_lock`
  // in `crates/koloda/tests/integration/templates_integration_tests.rs`.
  it("clones fields and layout without notes or lock", async () => {
    const { db } = testDb;
    const { deck, template } = await seedDeckContext(db);
    const content = editedContent(template);
    const source = await updateTemplate(db, {
      id: template.id,
      values: { title: template.title, notes: "Source notes", content },
    });
    await addCard(db, { deckId: deck.id, templateId: source.id, content: createCardContent(source) });

    const clone = await cloneTemplate(db, { title: "Clone", sourceId: source.id });

    expect(clone.id).not.toBe(source.id);
    expect(clone).toMatchObject({ title: "Clone", content, isLocked: false });
    expect(clone.notes).toBeUndefined();
    expect((await getTemplate(db, source.id))?.isLocked).toBe(true);
  });

  // Twin of `get_templates_reports_each_templates_own_lock` in
  // `crates/koloda/tests/integration/templates_integration_tests.rs`.
  it("lists each template with its own lock", async () => {
    const { db } = testDb;
    const { deck, template: used } = await seedDeckContext(db);
    const unused = await seedTemplate(db, { title: "Unused" });
    await addCard(db, { deckId: deck.id, templateId: used.id, content: createCardContent(used) });

    const locks = Object.fromEntries((await getTemplates(db)).map((template) => [template.id, template.isLocked]));

    expect(locks).toEqual({ [used.id]: true, [unused.id]: false });
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

  it.each<{ change: string; edit: (fields: TemplateField[]) => TemplateField[] }>([
    {
      change: "a field type",
      edit: (fields) => fields.map((field, i) => (i === 0 ? { ...field, type: "markdown" as const } : field)),
    },
    { change: "a removed field", edit: (fields) => fields.slice(1) },
  ])("rejects $change on a locked template and keeps the stored fields", async ({ edit }) => {
    const { db } = testDb;
    const { deck, template } = await seedDeckContext(db);
    await addCard(db, { deckId: deck.id, templateId: template.id, content: createCardContent(template) });

    const fields = edit(template.content.fields);
    const layout = template.content.layout.filter((item) => fields.some((field) => field.id === item.field));

    await expect(
      updateTemplate(db, { id: template.id, values: { title: template.title, content: { fields, layout } } }),
    ).rejects.toMatchObject({ code: "validation.templates.update-locked", details: undefined });

    expect((await getTemplate(db, template.id))?.content.fields).toEqual(template.content.fields);
  });

  it("rejects deleting a template referenced by a deck with no cards", async () => {
    const { db } = testDb;
    const { template } = await seedDeckContext(db);

    await expect(deleteTemplate(db, { id: template.id })).rejects.toMatchObject({
      code: "validation.templates.delete-used",
    });

    expect(await getTemplate(db, template.id)).not.toBeNull();
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

  it("fails closed when the stored learning settings row is invalid", async () => {
    const { db } = testDb;
    const template = await seedTemplate(db);

    // Valid JSON, invalid schema — a present-but-invalid row must not read as "absent".
    await db.run("INSERT INTO settings (name, content, created_at) VALUES (?, ?, ?)", [
      "learning",
      JSON.stringify({ dayStartsAt: 42 }),
      Date.now(),
    ]);

    await expect(deleteTemplate(db, { id: template.id })).rejects.toMatchObject({ code: "db.get" });
    expect(await getTemplate(db, template.id)).not.toBeNull();
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
});
