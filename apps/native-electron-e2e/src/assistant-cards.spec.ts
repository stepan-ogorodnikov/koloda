import { expect } from "@playwright/test";
import { test } from "./fixtures";
import type { Locator, Page } from "@playwright/test";
import {
  addLmStudioProfile,
  cardRows,
  conversationLog,
  createDeck,
  createDeckAndOpenAssistant,
  expectDeckCardCount,
  getConversationIdFromUrl,
  openAssistantWithConversation,
  openSection,
  sendAssistantMessage,
  setupApp,
  setupPageDefaults,
  waitForAssistantReady,
} from "./helpers";
import { mockOpenAICompatibleProvider } from "./mock-openai-compatible";

test.beforeEach(async ({ page }) => {
  await setupPageDefaults(page);
});

/** The proposal table renders on the assistant message inside the conversation log. */
function proposalTable(page: Page): Locator {
  return conversationLog(page).locator("table");
}

function proposedRow(page: Page, front: string): Locator {
  return proposalTable(page).getByRole("row").filter({ hasText: front });
}

/**
 * The row checkboxes have no accessible name. React-aria hides the <input>
 * inside a visually hidden span, so clicks must go to the visible <label>.
 */
function rowToggle(page: Page, row: Locator): Locator {
  return row.locator("label").filter({ has: page.getByRole("checkbox") });
}

function selectAllCheckbox(page: Page): Locator {
  return proposalTable(page).locator("thead").getByRole("checkbox");
}

/** The tool row headline the app builds for a successful `list_decks` call. */
function listDecksHeadlineText(deckTotal: number): string {
  return `List decks - ${deckTotal} deck${deckTotal === 1 ? "" : "s"}`;
}

test("adds exactly the selected proposed cards to the deck", async ({ page }) => {
  test.setTimeout(60_000);

  const mock = await mockOpenAICompatibleProvider({
    defaultCompletion: { text: "Proposed three cards.", chunkBy: "all" },
  });

  try {
    await setupApp(page);
    await addLmStudioProfile(page, { baseUrl: mock.baseUrl });
    const deckId = await createDeckAndOpenAssistant(page, "E2E Cards Deck");
    await waitForAssistantReady(page);

    const log = conversationLog(page);

    mock.enqueueCompletion({
      toolCall: {
        name: "propose_cards",
        arguments: {
          deckId,
          cards: [
            { fields: { Front: "Alpha front", Back: "Alpha back" } },
            { fields: { Front: "Beta front", Back: "Beta back" } },
          ],
        },
      },
    });
    // Held: the run stays streaming, so the deselection below cannot race the
    // second proposal's append.
    mock.enqueueCompletion({
      hold: true,
      toolCall: {
        name: "propose_cards",
        arguments: {
          deckId,
          cards: [{ fields: { Front: "Gamma front", Back: "Gamma back" } }],
        },
      },
    });
    mock.enqueueCompletion({ text: "Proposed three cards.", chunkBy: "all" });

    await sendAssistantMessage(page, "Make me some cards");

    const alphaRow = proposedRow(page, "Alpha front");
    const betaRow = proposedRow(page, "Beta front");
    const selectAll = selectAllCheckbox(page);

    // WHY: Exact match — the raw tool-call JSON payloads also quote the field text.
    await expect(alphaRow).toBeVisible({ timeout: 20_000 });
    await expect(betaRow).toBeVisible();
    // All rows start selected (ASSISTANT-CARD-GENERATION.md:74).
    await expect(alphaRow.getByRole("checkbox")).toBeChecked();
    await expect(betaRow.getByRole("checkbox")).toBeChecked();
    await expect(selectAll).toBeChecked();

    await rowToggle(page, betaRow).click();
    await expect(betaRow.getByRole("checkbox")).not.toBeChecked();
    await expect(selectAll).not.toBeChecked();

    mock.release();

    const gammaRow = proposedRow(page, "Gamma front");
    await expect(gammaRow).toBeVisible({ timeout: 20_000 });
    // Appended rows arrive selected while the user's deselection survives —
    // both selection invariants from ASSISTANT-CARD-GENERATION.md:74/:116.
    await expect(gammaRow.getByRole("checkbox")).toBeChecked();
    await expect(alphaRow.getByRole("checkbox")).toBeChecked();
    await expect(betaRow.getByRole("checkbox")).not.toBeChecked();
    // 2 of 3 idle rows selected: the header is unchecked AND indeterminate
    // (ASSISTANT-CARD-GENERATION.md:112-113). React-aria sets `indeterminate`
    // directly on the input element, so it is read as a DOM property.
    await expect(selectAll).toHaveJSProperty("indeterminate", true);

    // Both tool calls executed and were recorded separately (unique ids).
    await expect(log.getByText("Propose cards - 2 cards", { exact: true })).toBeVisible();
    await expect(log.getByText("Propose cards - 1 card", { exact: true })).toBeVisible();
    await expect(log.getByText("Proposed three cards.")).toBeVisible();

    // Add is gated on the run no longer being the current one.
    const addButton = log.getByRole("button", { name: "Add cards" });
    await expect(addButton).toBeEnabled({ timeout: 20_000 });

    await addButton.click();

    // After a successful add the selection is cleared and each card is marked
    // per-card; the table itself stays rendered (ASSISTANT-CARD-GENERATION.md:129-130).
    await expect(alphaRow.getByLabel("Success", { exact: true })).toBeVisible();
    await expect(gammaRow.getByLabel("Success", { exact: true })).toBeVisible();
    await expect(betaRow.getByRole("checkbox")).toBeVisible();
    await expect(betaRow.getByRole("checkbox")).not.toBeChecked();
    // Only idle rows remain selectable, so a cleared selection leaves the
    // select-all header unchecked.
    await expect(selectAll).not.toBeChecked();
    await expect(addButton).toBeDisabled();
    await expect(proposalTable(page)).toBeVisible();

    // The write-back must hold exactly the selected cards: verify through the
    // real navigation into the deck's own card list.
    await openSection(page, "Decks");
    await page.getByRole("link", { name: "E2E Cards Deck", exact: true }).click();
    await page.getByRole("tab", { name: "Cards" }).click();

    await expectDeckCardCount(page, 2);
    const deckRows = cardRows(page);
    await expect(deckRows.filter({ hasText: "Alpha front" })).toBeVisible();
    await expect(deckRows.filter({ hasText: "Gamma front" })).toBeVisible();
    await expect(deckRows.filter({ hasText: "Beta front" })).toHaveCount(0);

    // One model request per stream step: initial + one follow-up per executed
    // tool call (2) + the text step.
    expect(mock.completionRequests).toBe(3);
  } finally {
    mock.release();
    await mock.dispose();
  }
});

test("retries a failed cards run against the current deck state", async ({ page }) => {
  test.setTimeout(60_000);

  const mock = await mockOpenAICompatibleProvider({
    defaultCompletion: { status: 500 },
  });

  try {
    await setupApp(page);
    await addLmStudioProfile(page, { baseUrl: mock.baseUrl });
    const deckId = await createDeckAndOpenAssistant(page, "E2E Cards Deck");
    await waitForAssistantReady(page);
    const conversationId = getConversationIdFromUrl(page);

    const log = conversationLog(page);

    mock.enqueueCompletion({ toolCall: { name: "list_decks", arguments: {} } });
    mock.enqueueCompletion({
      toolCall: {
        name: "propose_cards",
        arguments: {
          deckId,
          cards: [{ fields: { Front: "First run front", Back: "First run back" } }],
        },
      },
    });
    mock.enqueueCompletion({ status: 500 });

    await sendAssistantMessage(page, "Propose a card");

    // The native seed ships no decks, so the first run's deck count is read
    // from the tool row headline instead of being hardcoded — the retried run
    // below must see exactly one more deck.
    const listDecksHeadline = log.getByText(/^List decks - \d+ decks?$/);
    await expect(listDecksHeadline).toBeVisible({ timeout: 20_000 });
    const deckCount = Number((await listDecksHeadline.textContent())?.match(/\d+/)?.[0]);
    const runOneListDecks = log.getByText(listDecksHeadlineText(deckCount), { exact: true });
    await expect(runOneListDecks).toBeVisible();
    await expect(log.getByText("Propose cards - 1 card", { exact: true })).toBeVisible();
    // Partial output survives the failure (ASSISTANT-CARD-GENERATION.md:82).
    // WHY: Exact match — the tool-call JSON payloads also quote the field text.
    await expect(log.getByText("First run front", { exact: true })).toBeVisible();
    await expect(log.getByText("Failed to get a response")).toBeVisible();
    await expect(log.getByRole("button", { name: "Retry" })).toBeVisible();

    // Change deck data the honest way — the second deck exists only from now on.
    await createDeck(page, "E2E Later Deck");

    // The failed run status save is debounced after completion; wait for the
    // flush so restore sees a finished run instead of a streaming checkpoint.
    await page.waitForTimeout(1_500);

    await openAssistantWithConversation(page, conversationId);
    await waitForAssistantReady(page);

    await expect(log.getByText("First run front", { exact: true })).toBeVisible();
    await expect(log.getByRole("button", { name: "Retry" })).toBeVisible();

    mock.enqueueCompletion({ toolCall: { name: "list_decks", arguments: {} } });
    mock.enqueueCompletion({
      toolCall: {
        name: "propose_cards",
        arguments: {
          deckId,
          cards: [{ fields: { Front: "Retry front", Back: "Retry back" } }],
        },
      },
    });
    mock.enqueueCompletion({ text: "Proposed a replacement card.", chunkBy: "all" });

    await log.getByRole("button", { name: "Retry" }).click();

    // Previous cards are cleared and replaced (ASSISTANT-CARD-GENERATION.md:151).
    await expect(log.getByText("First run front", { exact: true })).toHaveCount(0);
    // Retried tools execute against the decks as they are now — the second
    // deck was created after the original run failed, so the list_decks count
    // grows by exactly one and REPLACES the previous tool row instead of
    // replaying a snapshot (ASSISTANT-DATA-ACCESS.md:115-117).
    await expect(log.getByText(listDecksHeadlineText(deckCount + 1), { exact: true })).toBeVisible({
      timeout: 20_000,
    });
    await expect(runOneListDecks).toHaveCount(0);
    await expect(log.getByText("Retry front", { exact: true })).toBeVisible();

    // Each run is a fresh stream from scratch: one model request per step
    // (initial + one follow-up per executed tool call) — 3 for the retried
    // run. The failed run consumed 5: 2 tool steps + the failed step re-read
    // twice by the AI SDK's default maxRetries=2 before the failure surfaced.
    // 5 + 3 = 8; a replay-style retry would not re-request its steps at all.
    expect(mock.completionRequests).toBe(8);

    // The retried run succeeded: the new proposal is offered for adding.
    await expect(log.getByRole("button", { name: "Add cards" })).toBeEnabled({ timeout: 20_000 });
    await expect(log.getByText("Proposed a replacement card.")).toBeVisible();
  } finally {
    await mock.dispose();
  }
});
