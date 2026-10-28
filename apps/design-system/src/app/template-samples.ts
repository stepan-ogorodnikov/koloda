import type { Template } from "@koloda/srs";

const BASIC_TEMPLATE_ID = "0199a1c0-0000-7000-8000-000000000001";
const FRONT_FIELD_ID = "0199a1c0-0000-7000-8000-000000000011";
const BACK_FIELD_ID = "0199a1c0-0000-7000-8000-000000000012";

// WHY: locked, since the sample decks and the proposed cards in the assistant samples use it.
export const SAMPLE_TEMPLATE: Template = {
  id: BASIC_TEMPLATE_ID,
  title: "Basic",
  notes: "A prompt on the front; type the answer from the back.",
  content: {
    fields: [
      { id: FRONT_FIELD_ID, title: "Front", type: "text", isRequired: true },
      { id: BACK_FIELD_ID, title: "Back", type: "markdown", isRequired: true },
    ],
    layout: [
      { field: FRONT_FIELD_ID, operation: "display" },
      { field: BACK_FIELD_ID, operation: "type" },
    ],
  },
  isLocked: true,
  createdAt: new Date("2026-09-15T10:00:00.000Z"),
  updatedAt: new Date("2026-10-20T08:30:00.000Z"),
};
