import { expect, test } from "@playwright/test";
import {
  addLmStudioProfile,
  conversationLog,
  createDeckAndOpenAssistant,
  sendAssistantMessage,
  sendCardsAssistantMessage,
  setupDemo,
  setupPageDefaults,
  waitForAssistantReady,
} from "./helpers";
import { E2E_LM_STUDIO_BASE_URL, mockOpenAICompatibleProvider } from "./mock-openai-compatible";

test.beforeEach(async ({ page }) => {
  await setupPageDefaults(page);
});

test("sends a message and shows the mocked assistant reply", async ({ page }) => {
  const mock = await mockOpenAICompatibleProvider(page, {
    defaultCompletion: { text: "Mocked reply for E2E.", chunkBy: "all" },
  });

  try {
    await setupDemo(page);
    await addLmStudioProfile(page, { baseUrl: E2E_LM_STUDIO_BASE_URL });
    await createDeckAndOpenAssistant(page);
    await waitForAssistantReady(page);

    await sendAssistantMessage(page, "Hello assistant");

    const log = conversationLog(page);
    await expect(log.getByText("Hello assistant")).toBeVisible();
    await expect(log.getByText("Mocked reply for E2E.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Send" })).toBeVisible();
    expect(mock.completionRequests).toBeGreaterThanOrEqual(1);
  } finally {
    await mock.dispose();
  }
});

test("cancels an in-flight stream", async ({ page }) => {
  const mock = await mockOpenAICompatibleProvider(page, {
    defaultCompletion: { hold: true },
  });

  try {
    await setupDemo(page);
    await addLmStudioProfile(page, { baseUrl: E2E_LM_STUDIO_BASE_URL });
    await createDeckAndOpenAssistant(page);
    await waitForAssistantReady(page);

    await sendAssistantMessage(page, "Please hang");

    const log = conversationLog(page);
    await expect(log.getByText("Working")).toBeVisible();
    await expect(page.getByRole("button", { name: "Cancel request" })).toBeVisible();

    await page.getByRole("button", { name: "Cancel request" }).click();

    await expect(log.getByText("Interrupted after")).toBeVisible();
    await expect(page.getByRole("button", { name: "Send" })).toBeVisible();
  } finally {
    mock.release();
    await mock.dispose();
  }
});

test("retries a failed assistant response", async ({ page }) => {
  const mock = await mockOpenAICompatibleProvider(page, {
    defaultCompletion: { status: 500 },
  });

  try {
    await setupDemo(page);
    await addLmStudioProfile(page, { baseUrl: E2E_LM_STUDIO_BASE_URL });
    await createDeckAndOpenAssistant(page);
    await waitForAssistantReady(page);

    await sendAssistantMessage(page, "Trigger failure");

    const log = conversationLog(page);
    await expect(log.getByText("Failed to get a response")).toBeVisible();

    mock.setDefaultCompletion({ text: "Recovered after retry.", chunkBy: "all" });
    await log.getByRole("button", { name: "Retry" }).click();

    await expect(log.getByText("Recovered after retry.")).toBeVisible();
    expect(mock.completionRequests).toBeGreaterThanOrEqual(2);
  } finally {
    await mock.dispose();
  }
});

test("reverts a user message and restores it", async ({ page }) => {
  const mock = await mockOpenAICompatibleProvider(page, {
    defaultCompletion: { text: "Reply before revert.", chunkBy: "all" },
  });

  try {
    await setupDemo(page);
    await addLmStudioProfile(page, { baseUrl: E2E_LM_STUDIO_BASE_URL });
    await createDeckAndOpenAssistant(page);
    await waitForAssistantReady(page);

    await sendAssistantMessage(page, "Message to revert");

    const log = conversationLog(page);
    await expect(log.getByText("Reply before revert.")).toBeVisible();

    const userMessage = log.getByText("Message to revert");
    await userMessage.hover();
    await page.getByRole("button", { name: "Revert message" }).click();

    const revertBanner = page.getByText("Messages reverted");
    await expect(revertBanner).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Prompt input" })).toHaveValue("Message to revert");
    await expect(log.getByText("Reply before revert.")).toHaveCount(0);

    await page.getByRole("button", { name: "Restore" }).click();
    await expect(revertBanner).toHaveCount(0);
    await expect(log.getByText("Reply before revert.")).toBeVisible();
  } finally {
    await mock.dispose();
  }
});

test("generates cards and locks the deck", async ({ page }) => {
  const cardMarkdown = ["## Card 1", "**Front**: E2E front", "**Back**: E2E back"].join("\n");
  const mock = await mockOpenAICompatibleProvider(page, {
    defaultCompletion: { text: cardMarkdown, chunkBy: "all" },
  });

  try {
    await setupDemo(page);
    await addLmStudioProfile(page, { baseUrl: E2E_LM_STUDIO_BASE_URL });
    await createDeckAndOpenAssistant(page, "E2E Cards Deck");
    await waitForAssistantReady(page);

    // aria-label is always "Turn off…" (pressed state distinguishes on/off).
    const cardsToggle = page.getByRole("button", { name: "Turn off cards creation mode" });
    await expect(cardsToggle).toBeEnabled();
    await cardsToggle.click();
    await expect(cardsToggle).toHaveAttribute("aria-pressed", "true");

    await sendCardsAssistantMessage(page, "Make a card");

    await expect(page.getByText("E2E front")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("button", { name: /E2E Cards Deck/ })).toBeDisabled();

    expect(mock.completionRequests).toBeGreaterThanOrEqual(1);
  } finally {
    await mock.dispose();
  }
});
