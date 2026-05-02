import type { Template, TemplateField } from "@koloda/srs";

export type CardsTableContentColumn = {
  index: number;
  header: string;
  getFieldId: (template: Template | undefined) => TemplateField["id"] | undefined;
};

export function getCardsTableContentColumns(templates: Template[]): CardsTableContentColumn[] {
  if (templates.length === 0) return [];

  const maxLength = Math.max(...templates.map((t) => t.content.fields.length));
  const columns: CardsTableContentColumn[] = [];

  for (let i = 0; i < maxLength; i++) {
    const fieldsAtPosition: Array<{ templateId: Template["id"]; field: TemplateField }> = [];

    for (const template of templates) {
      const field = template.content.fields[i];
      if (field) fieldsAtPosition.push({ templateId: template.id, field });
    }

    if (fieldsAtPosition.length === 0) continue;

    const uniqueTitles = [...new Set(fieldsAtPosition.map((f) => f.field.title))];
    const header = uniqueTitles.length === 1 ? uniqueTitles[0] : `#${i + 1}`;

    columns.push({
      index: i,
      header,
      getFieldId: (template: Template | undefined) => template?.content.fields[i]?.id,
    });
  }

  return columns;
}
