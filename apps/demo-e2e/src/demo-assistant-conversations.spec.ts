import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";
import {
  addLmStudioProfile,
  conversationLog,
  createDeckAndOpenAssistant,
  getConversationIdFromUrl,
  openAssistantWithDeck,
  sendAssistantMessage,
  setupDemo,
  setupPageDefaults,
  startNewConversation,
  waitForAssistantReady,
  waitForConversationIdFromUrl,
} from "./helpers";
import { E2E_LM_STUDIO_BASE_URL, mockOpenAICompatibleProvider } from "./mock-openai-compatible";

test.beforeEach(async ({ page }) => {
  await setupPageDefaults(page);
});

function sidebarRow(page: Page, title: string): Locator {
  return page.getByRole("link", { name: title });
}

function workingMarker(row: Locator): Locator {
  return row.locator(`div[aria-label="Running"]`);
}

function unreadMarker(row: Locator): Locator {
  return row.locator(`div[aria-label="Unread"]`);
}

function rowDeleteTrigger(row: Locator): Locator {
  return row.getByRole("button", { name: "Delete conversation" });
}

/**
 * Environment-level IndexedDB write-failure simulation. PGlite (`idb://`)
 * persists every statement through Emscripten IDBFS, whose only durable write
 * is `IDBObjectStore.put`, so a synchronous throw from `put` rejects the
 * statement's persist and the app sees a real failed save/delete. No app code
 * is mocked; the wrapper passes through while disarmed.
 */
async function installIdbWriteFailureSim(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const state = { isArmed: false };
    (window as unknown as { __e2eIdbWriteFailure: { isArmed: boolean } }).__e2eIdbWriteFailure = state;
    const originalPut = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (this: IDBObjectStore, value: unknown, key?: IDBValidKey) {
      if (state.isArmed) {
        throw new DOMException("E2E simulated IndexedDB write failure", "QuotaExceededError");
      }
      return originalPut.call(this, value, key);
    };
  });
}

async function setIdbWriteFailureArmed(page: Page, isArmed: boolean): Promise<void> {
  await page.evaluate((armed) => {
    (window as unknown as { __e2eIdbWriteFailure: { isArmed: boolean } }).__e2eIdbWriteFailure.isArmed = armed;
  }, isArmed);
}

/**
 * Count the save queue's failed writes. Every failure is logged to the
 * renderer console (`console.error("[assistant.save]", …)`), one event per
 * attempt, which lets the tests gate on the queue's retry state instead of
 * guessing the backoff phase from wall-clock time.
 */
function watchSaveFailures(page: Page): { waitForCount: (count: number) => Promise<void> } {
  let failures = 0;
  page.on("console", (message) => {
    if (message.type() === "error" && message.text().startsWith("[assistant.save]")) failures += 1;
  });
  return {
    waitForCount: async (count: number) => {
      const deadline = Date.now() + 20_000;
      while (failures < count && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      if (failures < count) {
        throw new Error(`Expected ${count} save failures, saw ${failures}`);
      }
    },
  };
}

test("creates a conversation row from the first message, shows working status while streaming, and keeps each history intact", async ({
  page,
}) => {
  test.setTimeout(60_000);

  const mock = await mockOpenAICompatibleProvider(page, {
    defaultCompletion: { text: "Reply for the second conversation.", chunkBy: "all" },
  });

  try {
    await setupDemo(page);
    await addLmStudioProfile(page, { baseUrl: E2E_LM_STUDIO_BASE_URL });
    await createDeckAndOpenAssistant(page);
    await waitForAssistantReady(page);

    mock.enqueueCompletion({ text: "Reply for the first conversation.", chunkBy: "all", hold: true });
    await sendAssistantMessage(page, "First conversation prompt");

    // The row only exists once the first save flushed (streaming saves are
    // throttled to 1s), so visibility also proves the conversation persisted.
    const firstRow = sidebarRow(page, "First conversation prompt");
    await expect(firstRow).toBeVisible({ timeout: 15_000 });
    await expect(workingMarker(firstRow)).toBeVisible();

    mock.release();
    const log = conversationLog(page);
    await expect(log.getByText("Reply for the first conversation.")).toBeVisible({ timeout: 20_000 });
    await expect(workingMarker(firstRow)).toHaveCount(0);

    await startNewConversation(page);
    await waitForAssistantReady(page);
    await sendAssistantMessage(page, "Second conversation prompt");
    const secondRow = sidebarRow(page, "Second conversation prompt");
    await expect(secondRow).toBeVisible({ timeout: 15_000 });
    await expect(log.getByText("Reply for the second conversation.")).toBeVisible({ timeout: 20_000 });

    await firstRow.click();
    await expect(log.getByText("First conversation prompt")).toBeVisible();
    await expect(log.getByText("Reply for the first conversation.")).toBeVisible();
    await expect(log.getByText("Second conversation prompt")).toHaveCount(0);

    await secondRow.click();
    await expect(log.getByText("Second conversation prompt")).toBeVisible();
    await expect(log.getByText("Reply for the second conversation.")).toBeVisible();
    await expect(log.getByText("First conversation prompt")).toHaveCount(0);
  } finally {
    mock.release();
    await mock.dispose();
  }
});

test("marks a background-finished conversation unread until it is opened", async ({ page }) => {
  test.setTimeout(60_000);

  const mock = await mockOpenAICompatibleProvider(page, {
    defaultCompletion: { text: "Reply for the watched prompt.", chunkBy: "all" },
  });

  try {
    await setupDemo(page);
    await addLmStudioProfile(page, { baseUrl: E2E_LM_STUDIO_BASE_URL });
    await createDeckAndOpenAssistant(page);
    await waitForAssistantReady(page);

    const log = conversationLog(page);

    await sendAssistantMessage(page, "First prompt");
    await expect(log.getByText("Reply for the watched prompt.")).toBeVisible({ timeout: 20_000 });
    const firstRow = sidebarRow(page, "First prompt");
    await expect(firstRow).toBeVisible({ timeout: 15_000 });

    await startNewConversation(page);
    await waitForAssistantReady(page);
    await sendAssistantMessage(page, "Second prompt");
    const secondRow = sidebarRow(page, "Second prompt");
    await expect(secondRow).toBeVisible({ timeout: 15_000 });
    await expect(log.getByText("Reply for the watched prompt.")).toBeVisible({ timeout: 20_000 });

    await firstRow.click();
    // The log content is driven by the store's current-conversation id, so
    // visibility here proves the switch completed before the held run starts.
    await expect(log.getByText("First prompt")).toBeVisible({ timeout: 15_000 });
    await waitForAssistantReady(page);

    mock.enqueueCompletion({ text: "Reply for the unread prompt.", chunkBy: "all", hold: true });
    await sendAssistantMessage(page, "Unread marker prompt");
    await expect(workingMarker(firstRow)).toBeVisible();

    // Switch to the already-visited conversation; the run keeps streaming.
    // Wait for the flipped log content so the switch has fully settled before
    // the background completion is released.
    await secondRow.click();
    await expect(log.getByText("Second prompt")).toBeVisible({ timeout: 15_000 });
    await expect(workingMarker(firstRow)).toBeVisible();

    mock.release();

    // The run finished while another conversation was open, so it is unread.
    await expect(unreadMarker(firstRow)).toBeVisible({ timeout: 20_000 });
    await expect(workingMarker(firstRow)).toHaveCount(0);

    await firstRow.click();
    await expect(log.getByText("Unread marker prompt")).toBeVisible({ timeout: 15_000 });
    await expect(unreadMarker(firstRow)).toHaveCount(0);
    await expect(log.getByText("Reply for the unread prompt.")).toBeVisible({ timeout: 20_000 });
  } finally {
    mock.release();
    await mock.dispose();
  }
});

test("deleting the open conversation leaves its route and the deletion survives a reload", async ({ page }) => {
  test.setTimeout(60_000);

  const mock = await mockOpenAICompatibleProvider(page, {
    defaultCompletion: { text: "Reply for the deleted conversation.", chunkBy: "all" },
  });

  try {
    await setupDemo(page);
    await addLmStudioProfile(page, { baseUrl: E2E_LM_STUDIO_BASE_URL });
    await createDeckAndOpenAssistant(page);
    await waitForAssistantReady(page);

    await sendAssistantMessage(page, "Delete me prompt");
    const deletedRow = sidebarRow(page, "Delete me prompt");
    await expect(deletedRow).toBeVisible({ timeout: 15_000 });
    await expect(conversationLog(page).getByText("Reply for the deleted conversation.")).toBeVisible({
      timeout: 20_000,
    });

    // A second conversation must survive the delete so the sidebar is not empty.
    await startNewConversation(page);
    await waitForAssistantReady(page);
    await sendAssistantMessage(page, "Survivor prompt");
    const survivorRow = sidebarRow(page, "Survivor prompt");
    await expect(survivorRow).toBeVisible({ timeout: 15_000 });

    await deletedRow.click();
    const deletedConversationId = getConversationIdFromUrl(page);

    await deletedRow.hover();
    await rowDeleteTrigger(deletedRow).click();

    const confirmDialog = page.getByRole("dialog");
    await expect(confirmDialog.getByText("Delete this conversation? This cannot be undone.")).toBeVisible();
    await confirmDialog.getByRole("button", { name: "Delete", exact: true }).click();

    await expect(deletedRow).toHaveCount(0);
    await expect(page).not.toHaveURL(new RegExp(`conversationId=${deletedConversationId}($|&)`));
    await expect(page.getByRole("heading", { name: "Untitled conversation" })).toBeVisible();
    await expect(conversationLog(page).getByText("Delete me prompt")).toHaveCount(0);

    // Later activity (a save for the replacement conversation) must not
    // resurrect the deleted row.
    await waitForAssistantReady(page);
    mock.enqueueCompletion({ text: "Reply for the fresh conversation.", chunkBy: "all" });
    await sendAssistantMessage(page, "Fresh conversation prompt");
    const freshRow = sidebarRow(page, "Fresh conversation prompt");
    await expect(freshRow).toBeVisible({ timeout: 15_000 });
    await expect(conversationLog(page).getByText("Reply for the fresh conversation.")).toBeVisible({ timeout: 20_000 });

    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForAssistantReady(page);
    await expect(deletedRow).toHaveCount(0);
    await expect(survivorRow).toBeVisible();
    await expect(freshRow).toBeVisible();
    await expect(conversationLog(page).getByText("Fresh conversation prompt")).toBeVisible();
    await expect(conversationLog(page).getByText("Reply for the fresh conversation.")).toBeVisible();
  } finally {
    await mock.dispose();
  }
});

test("shows a failed delete error in the popover and keeps the conversation", async ({ page }) => {
  test.setTimeout(60_000);

  const mock = await mockOpenAICompatibleProvider(page, {
    defaultCompletion: { text: "Reply for the undeleted conversation.", chunkBy: "all" },
  });

  try {
    await installIdbWriteFailureSim(page);
    await setupDemo(page);
    await addLmStudioProfile(page, { baseUrl: E2E_LM_STUDIO_BASE_URL });
    await createDeckAndOpenAssistant(page);
    await waitForAssistantReady(page);

    await sendAssistantMessage(page, "Undeleted prompt");
    const row = sidebarRow(page, "Undeleted prompt");
    await expect(row).toBeVisible({ timeout: 15_000 });
    await expect(conversationLog(page).getByText("Reply for the undeleted conversation.")).toBeVisible({
      timeout: 20_000,
    });

    await setIdbWriteFailureArmed(page, true);

    await row.hover();
    await rowDeleteTrigger(row).click();

    const confirmDialog = page.getByRole("dialog");
    await expect(confirmDialog.getByText("Delete this conversation? This cannot be undone.")).toBeVisible();
    const confirmButton = confirmDialog.getByRole("button", { name: "Delete", exact: true });
    await confirmButton.click();

    // The DB delete rejected: the popover swaps its message for the error and
    // disables the confirm button.
    await expect(confirmDialog.getByText("Failed to delete data")).toBeVisible({ timeout: 15_000 });
    await expect(confirmButton).toBeDisabled();

    // The conversation itself is unchanged.
    await expect(row).toBeVisible();

    await confirmDialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(confirmDialog).not.toBeVisible();

    // Reopening the popover resets the error.
    await rowDeleteTrigger(row).click();
    await expect(confirmDialog.getByText("Delete this conversation? This cannot be undone.")).toBeVisible();
    await expect(confirmButton).toBeEnabled();
    await confirmDialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(confirmDialog).not.toBeVisible();

    await setIdbWriteFailureArmed(page, false);

    // No successful write flushed the failed delete, so after a reload the
    // conversation is still there with its history.
    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForAssistantReady(page);
    await expect(row).toBeVisible();
    await expect(conversationLog(page).getByText("Undeleted prompt")).toBeVisible();
    await expect(conversationLog(page).getByText("Reply for the undeleted conversation.")).toBeVisible();
  } finally {
    await mock.dispose();
  }
});

test("shows a save error banner that retry persists and dismiss hides without saving", async ({ page }) => {
  test.setTimeout(90_000);

  const mock = await mockOpenAICompatibleProvider(page, {
    defaultCompletion: { text: "Reply for the baseline prompt.", chunkBy: "all" },
  });
  const saveFailures = watchSaveFailures(page);

  try {
    await installIdbWriteFailureSim(page);
    await setupDemo(page);
    await addLmStudioProfile(page, { baseUrl: E2E_LM_STUDIO_BASE_URL });
    await createDeckAndOpenAssistant(page);
    await waitForAssistantReady(page);

    await sendAssistantMessage(page, "Baseline prompt");
    const log = conversationLog(page);
    await expect(log.getByText("Reply for the baseline prompt.")).toBeVisible({ timeout: 20_000 });
    await expect(sidebarRow(page, "Baseline prompt")).toBeVisible({ timeout: 15_000 });

    mock.enqueueCompletion({ text: "Reply after retry save.", chunkBy: "all" });
    await setIdbWriteFailureArmed(page, true);
    await sendAssistantMessage(page, "Prompt while writes fail");

    const retrySaveButton = page.getByRole("button", { name: "Retry save" });
    await expect(retrySaveButton).toBeVisible({ timeout: 20_000 });

    // WHY: the save queue retries failed writes with exponential backoff.
    // Waiting for the 4th failure log guarantees the next retry is ≥1s out
    // (delay = 250ms·2^(N-1)·jitter), so no background retry can fire between
    // disarming the failure and the click.
    await saveFailures.waitForCount(4);
    await setIdbWriteFailureArmed(page, false);
    await retrySaveButton.click();
    await expect(retrySaveButton).toHaveCount(0);
    await expect(log.getByText("Reply after retry save.")).toBeVisible({ timeout: 20_000 });

    mock.enqueueCompletion({ text: "Reply after dismiss save.", chunkBy: "all" });
    await setIdbWriteFailureArmed(page, true);
    await sendAssistantMessage(page, "Prompt for dismiss cycle");
    await expect(retrySaveButton).toBeVisible({ timeout: 20_000 });

    await saveFailures.waitForCount(8);
    await setIdbWriteFailureArmed(page, false);
    await page.getByRole("button", { name: "Hide errors" }).click();
    await expect(retrySaveButton).toHaveCount(0);

    // The banner stays hidden while the pending save succeeds in the
    // background — dismissal does not trigger or block the save.
    await page.waitForTimeout(2_500);
    await expect(retrySaveButton).toHaveCount(0);

    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForAssistantReady(page);
    const logAfter = conversationLog(page);
    await expect(logAfter.getByText("Baseline prompt", { exact: true })).toBeVisible();
    await expect(logAfter.getByText("Reply for the baseline prompt.")).toBeVisible();
    await expect(logAfter.getByText("Prompt while writes fail")).toBeVisible();
    await expect(logAfter.getByText("Reply after retry save.")).toBeVisible();
    await expect(logAfter.getByText("Prompt for dismiss cycle")).toBeVisible();
    await expect(logAfter.getByText("Reply after dismiss save.")).toBeVisible();
  } finally {
    await mock.dispose();
  }
});

test("restores a finished run with its success status after a plain reload", async ({ page }) => {
  test.setTimeout(60_000);

  const mock = await mockOpenAICompatibleProvider(page, {
    defaultCompletion: { text: "Reply that must survive reload.", chunkBy: "all" },
  });

  try {
    await setupDemo(page);
    await addLmStudioProfile(page, { baseUrl: E2E_LM_STUDIO_BASE_URL });
    await createDeckAndOpenAssistant(page);
    await waitForAssistantReady(page);

    await sendAssistantMessage(page, "Prompt that must survive reload");

    const log = conversationLog(page);
    await expect(log.getByText("Reply that must survive reload.")).toBeVisible({ timeout: 20_000 });
    await expect(log.getByText("Working")).toHaveCount(0);

    // The run status save is debounced after completion; wait for the flush so
    // restore sees a finished run instead of a streaming checkpoint.
    await expect(sidebarRow(page, "Prompt that must survive reload")).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(1_500);

    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForAssistantReady(page);

    const logAfter = conversationLog(page);
    await expect(logAfter.getByText("Prompt that must survive reload")).toBeVisible();
    await expect(logAfter.getByText("Reply that must survive reload.")).toBeVisible();
    // The success status renders the run's model name; interrupted, canceled,
    // and failed runs render their own status line instead.
    await expect(logAfter.getByText("e2e-test-model")).toBeVisible();
    await expect(logAfter.getByRole("button", { name: "Retry" })).toHaveCount(0);
    await expect(logAfter.getByText("Interrupted after")).toHaveCount(0);
    await expect(logAfter.getByText("Canceled after")).toHaveCount(0);
    await expect(logAfter.getByText("Failed to get a response")).toHaveCount(0);
  } finally {
    await mock.dispose();
  }
});

test("recovers when the stored active conversation id has no row", async ({ page }) => {
  test.setTimeout(60_000);

  await setupDemo(page);
  // WHY: In production the pointer outlives its row (row deleted elsewhere, DB
  // reset). The init script re-seeds it on every load, so the /ai navigation
  // below boots with a stale activeConversationId.
  await page.addInitScript(() => window.localStorage.setItem("activeConversationId", "e2e-missing-row"));

  await openAssistantWithDeck(page);

  // The route picked up the stale pointer instead of creating a conversation…
  await expect(page).toHaveURL(/conversationId=e2e-missing-row($|&)/);
  // …and restoring the missing row lands on an editable fresh conversation
  // instead of staying on the restoring state forever.
  await expect(page.getByRole("heading", { name: "Untitled conversation" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Prompt input" })).toBeVisible();
});

test("types a draft that mints an id, follows the prompt, Untitled when wiped, and deletes without confirmation", async ({
  page,
}) => {
  test.setTimeout(60_000);

  await setupDemo(page);
  await openAssistantWithDeck(page);
  await expect(page).not.toHaveURL(/conversationId=/);

  const prompt = page.getByRole("textbox", { name: "Prompt input" });
  await prompt.fill("   ");
  await expect(page).not.toHaveURL(/conversationId=/);

  await prompt.fill("Live draft title");
  await waitForConversationIdFromUrl(page);

  const draftRow = sidebarRow(page, "Live draft title");
  await expect(draftRow).toBeVisible({ timeout: 15_000 });
  await expect(draftRow.locator("[data-has-turns]")).toHaveAttribute("data-has-turns", "false");
  const header = page.getByRole("heading", { name: "Live draft title" });
  await expect(header).toBeVisible();
  await expect(header).not.toHaveAttribute("data-has-turns");

  await prompt.clear();
  const untitledRow = sidebarRow(page, "Untitled conversation");
  await expect(untitledRow).toBeVisible();
  await expect(untitledRow.locator("[data-has-turns]")).toHaveAttribute("data-has-turns", "false");

  await untitledRow.hover();
  await rowDeleteTrigger(untitledRow).click();
  await expect(page.getByText("Delete this conversation? This cannot be undone.")).toHaveCount(0);
  await expect(untitledRow).toHaveCount(0);
  await expect(page).not.toHaveURL(/conversationId=/);
});

test("still confirms when deleting a conversation that has a turn", async ({ page }) => {
  test.setTimeout(60_000);

  const mock = await mockOpenAICompatibleProvider(page, {
    defaultCompletion: { text: "Reply after the turn.", chunkBy: "all" },
  });

  try {
    await setupDemo(page);
    await addLmStudioProfile(page, { baseUrl: E2E_LM_STUDIO_BASE_URL });
    await createDeckAndOpenAssistant(page);
    await waitForAssistantReady(page);

    await sendAssistantMessage(page, "Turn then delete");
    const row = sidebarRow(page, "Turn then delete");
    await expect(row).toBeVisible({ timeout: 15_000 });
    await expect(row.locator("[data-has-turns]")).toHaveAttribute("data-has-turns", "true");
    await expect(conversationLog(page).getByText("Reply after the turn.")).toBeVisible({ timeout: 20_000 });

    await row.hover();
    await rowDeleteTrigger(row).click();
    const confirmDialog = page.getByRole("dialog");
    await expect(confirmDialog.getByText("Delete this conversation? This cannot be undone.")).toBeVisible();
    await confirmDialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(confirmDialog).not.toBeVisible();
    await expect(row).toBeVisible();
  } finally {
    await mock.dispose();
  }
});

test("reloads the param-less AI route onto the last active conversation", async ({ page }) => {
  test.setTimeout(60_000);

  await setupDemo(page);
  await openAssistantWithDeck(page);

  const prompt = page.getByRole("textbox", { name: "Prompt input" });
  await prompt.fill("Last active draft");
  const activeId = await waitForConversationIdFromUrl(page);
  const row = sidebarRow(page, "Last active draft");
  await expect(row).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(1_500);

  // WHY: setupPageDefaults clears localStorage on every document load. Re-seed
  // the stored active id after that clear so a param-less /ai visit restores.
  await page.addInitScript((id) => {
    window.localStorage.setItem("activeConversationId", id);
  }, activeId);
  await openAssistantWithDeck(page);
  await expect(page).toHaveURL(new RegExp(`conversationId=${activeId}($|&)`));
  await expect(row).toBeVisible();
});

test("New conversation stays on the param-less route after a reload", async ({ page }) => {
  test.setTimeout(60_000);

  await setupDemo(page);
  await openAssistantWithDeck(page);

  const prompt = page.getByRole("textbox", { name: "Prompt input" });
  await prompt.fill("Draft before new");
  await waitForConversationIdFromUrl(page);
  await expect(sidebarRow(page, "Draft before new")).toBeVisible({ timeout: 15_000 });

  await startNewConversation(page);
  expect(await page.evaluate(() => window.localStorage.getItem("activeConversationId"))).toBeNull();

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByRole("textbox", { name: "Prompt input" })).toBeVisible();
  await expect(page).not.toHaveURL(/conversationId=/);
});

test("can keep more than one draft at once", async ({ page }) => {
  test.setTimeout(60_000);

  await setupDemo(page);
  await openAssistantWithDeck(page);

  const prompt = page.getByRole("textbox", { name: "Prompt input" });
  await prompt.fill("Draft alpha");
  const firstId = await waitForConversationIdFromUrl(page);
  await expect(sidebarRow(page, "Draft alpha")).toBeVisible({ timeout: 15_000 });

  await startNewConversation(page);
  await prompt.fill("Draft beta");
  const secondId = await waitForConversationIdFromUrl(page);
  expect(secondId).not.toBe(firstId);

  const alpha = sidebarRow(page, "Draft alpha");
  const beta = sidebarRow(page, "Draft beta");
  await expect(alpha).toBeVisible();
  await expect(beta).toBeVisible();
  await expect(alpha.locator("[data-has-turns]")).toHaveAttribute("data-has-turns", "false");
  await expect(beta.locator("[data-has-turns]")).toHaveAttribute("data-has-turns", "false");
});
