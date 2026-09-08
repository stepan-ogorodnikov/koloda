import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import {
  addLmStudioProfile,
  conversationLog,
  createDeckAndOpenAssistant,
  expectDeckCardCount,
  openAssistantWithDeck,
  openSection,
  sendAssistantMessage,
  waitForAssistantReady,
} from "@koloda/e2e";
import { setupWeb, setupPageDefaults } from "./helpers";
import { E2E_LM_STUDIO_BASE_URL, mockOpenAICompatibleProvider } from "./mock-openai-compatible";

test.beforeEach(async ({ page }) => {
  await setupPageDefaults(page);
});

/** Front text for a seeded card: the label plus padding that bloats the serialized tool output. */
function dataFront(label: string): string {
  // WHY: three ~1,050-char Fronts serialize the get_deck_cards output to ~3,300
  // chars — past the run record's 2,000-char stored cap (the UI row keeps only a
  // 400-char preview) yet under the model's 8,000-char budget (the model still
  // receives every card and isCapped stays false).
  return `Data front ${label}${"x".repeat(1_000)}`;
}

/**
 * Mirrors helpers.ts `addCard`, but fills the fields instead of typing them.
 * WHY: each Front carries ~1,000 chars and `page.keyboard.type` sends one
 * keystroke per char — needlessly slow for three cards; fill dispatches the
 * same input events the dialog reads.
 */
async function addLargeCard(page: Page, front: string, back: string) {
  await page.getByRole("button", { name: "Add cards" }).click();

  const addCardDialog = page.getByRole("dialog");
  await expect(addCardDialog).toBeVisible();

  await addCardDialog.getByRole("textbox", { name: "Front" }).fill(front);
  await addCardDialog.getByRole("textbox", { name: "Back" }).fill(back);

  await addCardDialog.getByRole("button", { name: "Create card" }).click();
  await expect(addCardDialog.getByRole("textbox", { name: "Front" })).toHaveValue("");

  await page.keyboard.press("Escape");
  await expect(addCardDialog).not.toBeVisible();
}

test("answers from real deck rows through read-only tools", async ({ page }) => {
  test.setTimeout(60_000);

  const deckTitle = "E2E Data Deck";
  // WHY: the get_deck_cards result reaches the model as a JSON-escaped string
  // inside the request body (openai-compatible sends content: JSON.stringify of
  // the output), so the echoed row must be the wire form `\"deckTitle\":\"...\"`
  // — the unescaped pretty form never appears in the raw body.
  const deckTitleRow = 'deckTitle\\":\\"E2E Data Deck';
  const rows = [deckTitleRow, dataFront("A"), dataFront("B"), dataFront("C")];
  // WHY: the chat renders replies as markdown, which consumes the wire form's
  // `\"` backslash escapes — the visible reply shows the unescaped form.
  const asRendered = (reply: string) => reply.replaceAll('\\"', '"');

  const mock = await mockOpenAICompatibleProvider(page, {
    // WHY: the user prompt avoids every row string, so a row can only reach the
    // reply if it egressed to the model inside a tool result — the round trip
    // real DB rows -> executor -> tool result -> model request -> visible reply.
    completionFromBody: (body) => ({
      text: `I found: ${rows.filter((row) => body.includes(row)).join(", ")}`,
      chunkBy: "all",
    }),
  });

  try {
    await setupWeb(page);
    await addLmStudioProfile(page, { baseUrl: E2E_LM_STUDIO_BASE_URL });
    const deckId = await createDeckAndOpenAssistant(page, deckTitle);
    await waitForAssistantReady(page);

    // Seed the deck past the stored-output cap before anything is sent.
    await openSection(page, "Decks");
    await page.getByRole("link", { name: deckTitle, exact: true }).click();
    await page.getByRole("tab", { name: "Cards" }).click();
    await addLargeCard(page, dataFront("A"), "Data back A");
    await addLargeCard(page, dataFront("B"), "Data back B");
    await addLargeCard(page, dataFront("C"), "Data back C");
    await expectDeckCardCount(page, 3);

    // Fresh conversation for the run: the auto-created one from setup stays empty.
    await openAssistantWithDeck(page);
    await waitForAssistantReady(page);

    const log = conversationLog(page);

    // WHY: the FIFO scripts the two tool steps; the reply step falls through to
    // completionFromBody, which echoes only what the request body contained.
    mock.enqueueCompletion({ toolCall: { name: "list_decks", arguments: {} } });
    mock.enqueueCompletion({ toolCall: { name: "get_deck_cards", arguments: { deckId } } });

    await sendAssistantMessage(page, "What cards are in my decks?");

    // WHY dynamic: the web seed ships 6 decks and this test creates one more,
    // so the headline count is matched as a pattern, not a hardcoded total.
    const listDecksRow = log.getByRole("button", { name: /^List decks \d+ decks?$/ });
    await expect(listDecksRow).toBeVisible({ timeout: 20_000 });
    // WHY exact: the deck holds exactly the 3 seeded cards, and the run record
    // preserves the executor's totalCards even though the stored output itself
    // is bounded to a preview (spec Visibility: a successful row shows how many
    // cards came back).
    const getDeckCardsRow = log.getByRole("button", { name: "Get deck cards 3 cards" });
    await expect(getDeckCardsRow).toBeVisible({ timeout: 20_000 });

    // WHY: Expand list_decks: its stored copy is well under 2,000 chars, so it shows
    // the plain "Output" label — the contrast that proves "Output (truncated)"
    // below is conditional on real size, not on the tool name.
    await listDecksRow.click();
    await expect(listDecksRow).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(log.getByText("Output", { exact: true })).toBeVisible();
    // WHY: the executor really read the DB: the new deck's title and card count sit
    // in the inspect output while the model only sent an empty {} call.
    const listDecksOutputPre = log.locator("pre").filter({ hasText: `"${deckTitle}"` });
    await expect(listDecksOutputPre).toContainText('"cardCount": 3');

    await listDecksRow.click();
    await expect(listDecksRow).toHaveAttribute("aria-expanded", "false");
    await expect(log.getByText("Output", { exact: true })).toHaveCount(0);

    // WHY: Expand get_deck_cards: its >2,000-char output was bounded by the run
    // record (MAX_TOOL_OUTPUT_CHARS = 2000), so the label switches to
    // "Output (truncated)" and the pre shows the 400-char compact preview.
    await getDeckCardsRow.click();
    await expect(getDeckCardsRow).toHaveAttribute("aria-expanded", "true");
    await expect(log.getByText("Output (truncated)", { exact: true })).toBeVisible();
    // WHY compact: the preview is the head of the compact serialized output —
    // the model itself still received the full ~3,300-char output under its
    // 8,000-char budget; the truncation is a run-record copy limit only.
    const previewPre = log.locator("pre").filter({ hasText: '"deckTitle":"E2E Data Deck"' });
    await expect(previewPre).toContainText('"totalCards":3');
    await expect(previewPre).toContainText('"Front":"Data front A');

    // Every seeded row egressed to the model and came back in the reply text.
    await expect(log.getByText(asRendered(`I found: ${rows.join(", ")}`))).toBeVisible({ timeout: 20_000 });

    // WHY: one model request per stream step — initial + one follow-up per
    // executed tool call. The reply step's FIFO slot is empty, so it is the one
    // that consumed completionFromBody; 3 proves the fallback ran exactly once
    // and no hidden extra request slipped in.
    expect(mock.completionRequests).toBe(3);
  } finally {
    await mock.dispose();
  }
});
