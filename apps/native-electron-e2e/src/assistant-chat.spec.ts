import { expect, test } from "./fixtures";
import type { Page } from "@playwright/test";
import {
  addLmStudioProfile,
  conversationLog,
  createDeckAndOpenAssistant,
  dispatchGracefulShutdown,
  getConversationIdFromUrl,
  openAssistantWithConversation,
  sendAssistantMessage,
  setupApp,
  setupPageDefaults,
  waitForAssistantReady,
} from "./helpers";
import { mockOpenAICompatibleProvider } from "./mock-openai-compatible";

test.beforeEach(async ({ page }) => {
  await setupPageDefaults(page);
});

/**
 * Exhaust the submit affordances with an empty prompt. `Send` is disabled for
 * an empty prompt, so the click is forced; the Enter press covers the form
 * submit path. Both must be no-ops.
 */
async function submitEmptyPrompt(page: Page) {
  await page.getByRole("button", { name: "Send" }).click({ force: true });
  await page.getByRole("textbox", { name: "Prompt input" }).press("Enter");
}

test("sends a message and shows the mocked assistant reply", async ({ page }) => {
  const mock = await mockOpenAICompatibleProvider({
    defaultCompletion: { text: "Mocked reply for E2E.", chunkBy: "all" },
  });

  try {
    await setupApp(page);
    await addLmStudioProfile(page, { baseUrl: mock.baseUrl });
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
  const mock = await mockOpenAICompatibleProvider({
    defaultCompletion: { hold: true },
  });

  try {
    await setupApp(page);
    await addLmStudioProfile(page, { baseUrl: mock.baseUrl });
    await createDeckAndOpenAssistant(page);
    await waitForAssistantReady(page);

    await sendAssistantMessage(page, "Please hang");

    const log = conversationLog(page);
    await expect(log.getByText("Working")).toBeVisible();
    await expect(page.getByRole("button", { name: "Cancel request" })).toBeVisible();

    await page.getByRole("button", { name: "Cancel request" }).click();

    await expect(log.getByText("Canceled after")).toBeVisible();
    await expect(log.getByRole("button", { name: "Retry" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Send" })).toBeVisible();
  } finally {
    mock.release();
    await mock.dispose();
  }
});

test("interrupts an in-flight stream on graceful shutdown", async ({ page }) => {
  const mock = await mockOpenAICompatibleProvider({
    defaultCompletion: { hold: true },
  });

  try {
    await setupApp(page);
    await addLmStudioProfile(page, { baseUrl: mock.baseUrl });
    await createDeckAndOpenAssistant(page);
    await waitForAssistantReady(page);

    await sendAssistantMessage(page, "Please hang");

    const log = conversationLog(page);
    await expect(log.getByText("Working")).toBeVisible();
    await expect(log.getByText("Please hang")).toBeVisible();

    await dispatchGracefulShutdown(page);

    await expect(log.getByText("Interrupted after")).toBeVisible();
    await expect(log.getByRole("button", { name: "Retry" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Send" })).toBeVisible();
  } finally {
    mock.release();
    await mock.dispose();
  }
});

test("restores an interrupted stream after crash recovery", async ({ page }) => {
  test.setTimeout(60_000);

  const mock = await mockOpenAICompatibleProvider({
    defaultCompletion: { hold: true },
  });

  try {
    await setupApp(page);
    await addLmStudioProfile(page, { baseUrl: mock.baseUrl });
    await createDeckAndOpenAssistant(page);
    await waitForAssistantReady(page);

    await sendAssistantMessage(page, "Please hang");

    const log = conversationLog(page);
    await expect(log.getByText("Working")).toBeVisible();
    await expect(log.getByText("Please hang")).toBeVisible();

    // STREAM_SAVE_THROTTLE_MS is 1000ms — wait for a streaming checkpoint to persist.
    await page.waitForTimeout(1_500);

    const conversationId = getConversationIdFromUrl(page);

    await page.reload({ waitUntil: "domcontentloaded" });
    await openAssistantWithConversation(page, conversationId);
    await waitForAssistantReady(page);

    const logAfter = conversationLog(page);
    await expect(logAfter.getByText("Please hang")).toBeVisible();
    await expect(logAfter.getByText("Interrupted after")).toBeVisible();
    await expect(logAfter.getByRole("button", { name: "Retry" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Send" })).toBeVisible();
  } finally {
    mock.release();
    await mock.dispose();
  }
});

test("retries a failed assistant response", async ({ page }) => {
  const mock = await mockOpenAICompatibleProvider({
    defaultCompletion: { status: 500 },
  });

  try {
    await setupApp(page);
    await addLmStudioProfile(page, { baseUrl: mock.baseUrl });
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
  const mock = await mockOpenAICompatibleProvider({
    defaultCompletion: { text: "Reply before revert.", chunkBy: "all" },
  });

  try {
    await setupApp(page);
    await addLmStudioProfile(page, { baseUrl: mock.baseUrl });
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

test("keeps both turns visible and shows the latest run's context usage", async ({ page }) => {
  test.setTimeout(60_000);

  const mock = await mockOpenAICompatibleProvider({
    defaultCompletion: {
      text: "First turn reply.",
      chunkBy: "all",
      usage: { promptTokens: 100, completionTokens: 20 },
    },
  });

  try {
    await setupApp(page);
    await addLmStudioProfile(page, { baseUrl: mock.baseUrl });
    await createDeckAndOpenAssistant(page);
    await waitForAssistantReady(page);

    await sendAssistantMessage(page, "First turn prompt");

    const log = conversationLog(page);
    await expect(log.getByText("First turn prompt")).toBeVisible();
    await expect(log.getByText("First turn reply.")).toBeVisible();

    mock.enqueueCompletion({
      text: "Second turn reply.",
      chunkBy: "all",
      usage: { promptTokens: 130, completionTokens: 20 },
    });
    await sendAssistantMessage(page, "Second turn prompt");
    await expect(log.getByText("Second turn prompt")).toBeVisible();
    await expect(log.getByText("Second turn reply.")).toBeVisible();
    await expect(log.getByText("First turn reply.")).toBeVisible();

    // The meter appears once a run reports usage and reflects the LATEST run:
    // 130 + 20 = 150 tokens — not the sum of both runs (270) nor the first
    // run's stale usage (120).
    const usageMeter = page.locator(`div[role="button"]:has(svg.h-6.w-6)`);
    await expect(usageMeter).toHaveCount(1);
    await usageMeter.hover();
    const usageTooltip = page.getByRole("tooltip");
    await expect(usageTooltip.getByText("150", { exact: true })).toBeVisible();
    await expect(usageTooltip.getByText("270", { exact: true })).toHaveCount(0);
    await expect(usageTooltip.getByText("120", { exact: true })).toHaveCount(0);
  } finally {
    await mock.dispose();
  }
});

test("offers retry only on the most recent failed response", async ({ page }) => {
  const mock = await mockOpenAICompatibleProvider({
    defaultCompletion: { status: 500 },
  });

  try {
    await setupApp(page);
    await addLmStudioProfile(page, { baseUrl: mock.baseUrl });
    await createDeckAndOpenAssistant(page);
    await waitForAssistantReady(page);

    const log = conversationLog(page);

    await sendAssistantMessage(page, "First failed prompt");
    await expect(log.getByText("Failed to get a response")).toBeVisible();

    mock.enqueueCompletion({ status: 500 });
    await sendAssistantMessage(page, "Second failed prompt");
    const failureRows = log.getByText("Failed to get a response");
    await expect(failureRows).toHaveCount(2);

    // Both failed runs are retryable by status, yet only the most recent
    // message pair offers Retry.
    await expect(log.getByRole("button", { name: "Retry" })).toHaveCount(1);
    await expect(failureRows.first().locator("xpath=..").getByRole("button", { name: "Retry" })).toHaveCount(0);
    const newestRow = failureRows.last().locator("xpath=..");
    await expect(newestRow.getByRole("button", { name: "Retry" })).toHaveCount(1);

    // The offered retry re-executes the newest prompt and leaves the older
    // failure untouched.
    mock.setDefaultCompletion({ text: "Recovered on retry.", chunkBy: "all" });
    await newestRow.getByRole("button", { name: "Retry" }).click();
    await expect(log.getByText("Recovered on retry.")).toBeVisible();
    await expect(failureRows).toHaveCount(1);
  } finally {
    await mock.dispose();
  }
});

test("empty submit is a no-op", async ({ page }) => {
  const mock = await mockOpenAICompatibleProvider({
    defaultCompletion: { text: "Should never appear.", chunkBy: "all" },
  });

  try {
    await setupApp(page);
    await addLmStudioProfile(page, { baseUrl: mock.baseUrl });
    await createDeckAndOpenAssistant(page);
    await waitForAssistantReady(page);

    const log = conversationLog(page);
    await expect(log.locator("p")).toHaveCount(0);

    await submitEmptyPrompt(page);

    // A run starts only when a prompt is submitted: no user or assistant
    // message, no run status, and no request to the provider.
    await expect(log.locator("p")).toHaveCount(0);
    await expect(log.getByText("Working")).toHaveCount(0);
    await expect(page.getByText("Should never appear.")).toHaveCount(0);
    await expect.poll(() => mock.completionRequests, { timeout: 2_000 }).toBe(0);
  } finally {
    await mock.dispose();
  }
});

test("empty submit keeps a pending revert untouched", async ({ page }) => {
  const mock = await mockOpenAICompatibleProvider({
    defaultCompletion: { text: "Reply before revert.", chunkBy: "all" },
  });

  try {
    await setupApp(page);
    await addLmStudioProfile(page, { baseUrl: mock.baseUrl });
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
    const prompt = page.getByRole("textbox", { name: "Prompt input" });
    await expect(prompt).toHaveValue("Message to revert");

    // Clear the pre-filled revert prompt and submit empty.
    await prompt.fill("");
    await submitEmptyPrompt(page);

    // The pending revert is neither committed (the hidden turn still exists and
    // comes back on restore) nor discarded (the banner stays up), and no run
    // started for the empty submit.
    await expect(log.getByText("Message to revert")).toHaveCount(0);
    await expect(log.getByText("Reply before revert.")).toHaveCount(0);
    await expect(revertBanner).toBeVisible();
    await expect.poll(() => mock.completionRequests, { timeout: 2_000 }).toBe(1);

    await page.getByRole("button", { name: "Restore" }).click();
    await expect(revertBanner).toHaveCount(0);
    await expect(log.getByText("Message to revert")).toBeVisible();
    await expect(log.getByText("Reply before revert.")).toBeVisible();
  } finally {
    await mock.dispose();
  }
});

test("renders partial reply text while the stream is in flight", async ({ page }) => {
  test.setTimeout(60_000);

  const mock = await mockOpenAICompatibleProvider({
    defaultCompletion: { text: "Should never arrive.", chunkBy: "all" },
  });

  try {
    await setupApp(page);
    await addLmStudioProfile(page, { baseUrl: mock.baseUrl });
    await createDeckAndOpenAssistant(page);
    await waitForAssistantReady(page);

    // 13 SSE events paced 400ms apart: the first word renders immediately,
    // the final word lands ~4s in — far outside the negative window.
    mock.enqueueCompletion({ text: "Alpha beta gamma delta epsilon omega.", chunkDelayMs: 400 });
    await sendAssistantMessage(page, "Stream this prompt");

    const log = conversationLog(page);
    await expect(log.getByText("Alpha")).toBeVisible({ timeout: 10_000 });
    await expect(log.getByText("omega.")).toHaveCount(0, { timeout: 1_000 });
    await expect(log.getByText("Alpha beta gamma delta epsilon omega.")).toBeVisible({ timeout: 10_000 });
    expect(mock.completionRequests).toBe(1);
  } finally {
    await mock.dispose();
  }
});

test("shows streamed reasoning as a dimmed text block", async ({ page }) => {
  const mock = await mockOpenAICompatibleProvider({
    defaultCompletion: { text: "No reasoning here.", chunkBy: "all" },
  });

  try {
    await setupApp(page);
    await addLmStudioProfile(page, { baseUrl: mock.baseUrl });
    await createDeckAndOpenAssistant(page);
    await waitForAssistantReady(page);

    // Cut the think tags across chunk boundaries the way a real tokenizer can;
    // the app's own extraction must buffer them instead of leaking fragments.
    mock.enqueueCompletion({ chunks: ["<thi", "nk>Quiet plan.</thi", "nk>Visible answer."] });
    await sendAssistantMessage(page, "Think then answer");

    const log = conversationLog(page);
    // The extracted reasoning renders as a dimmed paragraph of its own, next
    // to the undimmed reply text.
    const reasoning = log.locator("p.fg-level-3").filter({ hasText: "Quiet plan." });
    const reply = log.locator("p:not(.fg-level-3)").filter({ hasText: "Visible answer." });
    await expect(reasoning).toBeVisible();
    await expect(reply).toBeVisible();

    // Reasoning never renders as plain reply text and the markup never leaks.
    await expect(log.locator("p:not(.fg-level-3)").filter({ hasText: "Quiet plan." })).toHaveCount(0);
    await expect(log.getByText("<think>")).toHaveCount(0);
    await expect(log.getByText("</think>")).toHaveCount(0);
  } finally {
    await mock.dispose();
  }
});
