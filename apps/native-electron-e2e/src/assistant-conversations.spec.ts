import { stat } from "node:fs/promises";
import { join } from "node:path";
import { expect } from "@playwright/test";
import { test } from "./fixtures";
import type { Locator, Page } from "@playwright/test";
import {
  addLmStudioProfile,
  conversationLog,
  createDeckAndOpenAssistant,
  getConversationIdFromUrl,
  openAssistantWithDeck,
  sendAssistantMessage,
  setupApp,
  setupPageDefaults,
  startNewConversation,
  waitForAssistantReady,
  waitForConversationIdFromUrl,
} from "./helpers";
import { mockOpenAICompatibleProvider } from "./mock-openai-compatible";

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

type SqliteWriteFailureSim = {
  /** Block SQLite write transactions until `disarm` (reads keep working). */
  arm: () => Promise<void>;
  /** Unblock write transactions; the sim can be armed again later. */
  disarm: () => Promise<void>;
  /** Roll any pending transaction back and close the connection. */
  dispose: () => Promise<void>;
};

type SqliteConnection = {
  exec: (sql: string) => void;
  close: () => void;
};

/**
 * Open a second SQLite connection to the app's database. `node:sqlite` ships
 * with the runtime; `better-sqlite3` is the fallback. Computed specifiers keep
 * both imports out of typechecking (no TS types are installed for either).
 */
async function openSqliteConnection(dbPath: string): Promise<SqliteConnection> {
  const nodeSqliteSpecifier = "node:sqlite";
  const betterSqlite3Specifier = "better-sqlite3";
  try {
    const { DatabaseSync } = (await import(nodeSqliteSpecifier)) as {
      DatabaseSync: new (path: string) => SqliteConnection;
    };
    return new DatabaseSync(dbPath);
  } catch {
    const betterSqlite3 = (await import(betterSqlite3Specifier)) as unknown as {
      default: new (path: string) => SqliteConnection;
    };
    return new betterSqlite3.default(dbPath);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
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
        await sleep(50);
      }
      if (failures < count) {
        throw new Error(`Expected ${count} save failures, saw ${failures}`);
      }
    },
  };
}

/**
 * Environment-level SQLite write-failure simulation. The desktop database is
 * SQLite (WAL mode) inside the Electron main process, so unlike the web suite
 * there is no renderer storage primitive to wrap. This opens a second
 * connection to the same database file from the test process and holds
 * `BEGIN IMMEDIATE`, which owns SQLite's single WAL writer lock: every app
 * write transaction fails immediately with SQLITE_BUSY (the busy handler is
 * deliberately skipped for the writer lock) while reads keep working. The
 * held transaction is never written, so disarming (ROLLBACK) restores normal
 * saves without touching the data. No app code is mocked.
 */
async function installSqliteWriteFailureSim(userDataDir: string): Promise<SqliteWriteFailureSim> {
  const dbPath = join(userDataDir, "koloda.db");
  let connection: SqliteConnection | null = null;
  let isArmed = false;

  const exec = (sql: string) => {
    const db = connection;
    if (!db) throw new Error("SQLite write-failure sim connection is not open");
    db.exec(sql);
  };

  const arm = async () => {
    if (isArmed) return;
    if (!connection) {
      // The database file exists once the app has booted and seeded; wait for it briefly.
      const openDeadline = Date.now() + 10_000;
      while (Date.now() < openDeadline) {
        try {
          if ((await stat(dbPath)).isFile()) break;
        } catch {}
        await sleep(100);
      }
      connection = await openSqliteConnection(dbPath);
      // Only this connection's own BEGIN retry may wait; the app must fail immediately.
      exec("PRAGMA busy_timeout = 100");
    }
    // BEGIN IMMEDIATE grabs the writer lock; retry briefly in case the app is mid-write.
    const deadline = Date.now() + 5_000;
    while (Date.now() < deadline) {
      try {
        exec("BEGIN IMMEDIATE");
        isArmed = true;
        return;
      } catch {
        await sleep(50);
      }
    }
    throw new Error("Could not acquire the SQLite writer lock for the write-failure sim");
  };

  const disarm = async () => {
    if (!isArmed) return;
    exec("ROLLBACK");
    isArmed = false;
  };

  const dispose = async () => {
    if (isArmed) await disarm();
    connection?.close();
    connection = null;
  };

  return { arm, disarm, dispose };
}

test("creates a conversation row from the first message, shows working status while streaming, and keeps each history intact", async ({
  page,
}) => {
  test.setTimeout(60_000);

  const mock = await mockOpenAICompatibleProvider({
    defaultCompletion: { text: "Reply for the second conversation.", chunkBy: "all" },
  });

  try {
    await setupApp(page);
    await addLmStudioProfile(page, { baseUrl: mock.baseUrl });
    await createDeckAndOpenAssistant(page);
    await waitForAssistantReady(page);

    mock.enqueueCompletion({ text: "Reply for the first conversation.", chunkBy: "all", hold: true });
    await sendAssistantMessage(page, "First conversation prompt");

    // The row only exists once the first save flushed (streaming saves are
    // throttled to 1s), so visibility also proves the conversation persisted.
    const firstRow = sidebarRow(page, "First conversation prompt");
    await expect(firstRow).toBeVisible({ timeout: 15_000 });
    await expect(workingMarker(firstRow)).toBeVisible();

    // The request reaches the mock asynchronously (renderer → main-process
    // fetch), and release() is a no-op until then — wait for the hold so the
    // release cannot race the request.
    await expect.poll(() => mock.isHolding()).toBe(true);
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

  const mock = await mockOpenAICompatibleProvider({
    defaultCompletion: { text: "Reply for the watched prompt.", chunkBy: "all" },
  });

  try {
    await setupApp(page);
    await addLmStudioProfile(page, { baseUrl: mock.baseUrl });
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

    // The request reaches the mock asynchronously (renderer → main-process
    // fetch), and release() is a no-op until then — wait for the hold so the
    // release cannot race the request.
    await expect.poll(() => mock.isHolding()).toBe(true);
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

  const mock = await mockOpenAICompatibleProvider({
    defaultCompletion: { text: "Reply for the deleted conversation.", chunkBy: "all" },
  });

  try {
    await setupApp(page);
    await addLmStudioProfile(page, { baseUrl: mock.baseUrl });
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

test("shows a failed delete error in the popover and keeps the conversation", async ({ page, userDataDir }) => {
  test.setTimeout(60_000);

  const mock = await mockOpenAICompatibleProvider({
    defaultCompletion: { text: "Reply for the undeleted conversation.", chunkBy: "all" },
  });
  const sqliteWriteFailure = await installSqliteWriteFailureSim(userDataDir);

  try {
    await setupApp(page);
    await addLmStudioProfile(page, { baseUrl: mock.baseUrl });
    await createDeckAndOpenAssistant(page);
    await waitForAssistantReady(page);

    await sendAssistantMessage(page, "Undeleted prompt");
    const row = sidebarRow(page, "Undeleted prompt");
    await expect(row).toBeVisible({ timeout: 15_000 });
    await expect(conversationLog(page).getByText("Reply for the undeleted conversation.")).toBeVisible({
      timeout: 20_000,
    });
    // WHY: the sidebar row's hasTurns only flips once the first save flushes,
    // and a draft row (hasTurns=false) deletes without confirmation — arming
    // the failure sim before that flip would skip the confirm dialog entirely.
    await expect(row.locator('[data-has-turns="true"]')).toBeVisible({ timeout: 15_000 });

    await sqliteWriteFailure.arm();

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

    await sqliteWriteFailure.disarm();

    // No successful write flushed the failed delete, so after a reload the
    // conversation is still there with its history.
    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForAssistantReady(page);
    await expect(row).toBeVisible();
    await expect(conversationLog(page).getByText("Undeleted prompt")).toBeVisible();
    await expect(conversationLog(page).getByText("Reply for the undeleted conversation.")).toBeVisible();
  } finally {
    await sqliteWriteFailure.dispose();
    await mock.dispose();
  }
});

test("shows a save error banner that retry persists and dismiss hides without saving", async ({
  page,
  userDataDir,
}) => {
  test.setTimeout(90_000);

  const mock = await mockOpenAICompatibleProvider({
    defaultCompletion: { text: "Reply for the baseline prompt.", chunkBy: "all" },
  });
  const sqliteWriteFailure = await installSqliteWriteFailureSim(userDataDir);
  const saveFailures = watchSaveFailures(page);

  try {
    await setupApp(page);
    await addLmStudioProfile(page, { baseUrl: mock.baseUrl });
    await createDeckAndOpenAssistant(page);
    await waitForAssistantReady(page);

    await sendAssistantMessage(page, "Baseline prompt");
    const log = conversationLog(page);
    await expect(log.getByText("Reply for the baseline prompt.")).toBeVisible({ timeout: 20_000 });
    await expect(sidebarRow(page, "Baseline prompt")).toBeVisible({ timeout: 15_000 });

    mock.enqueueCompletion({ text: "Reply after retry save.", chunkBy: "all" });
    await sqliteWriteFailure.arm();
    await sendAssistantMessage(page, "Prompt while writes fail");

    const retrySaveButton = page.getByRole("button", { name: "Retry save" });
    await expect(retrySaveButton).toBeVisible({ timeout: 20_000 });

    // WHY: mirrors the demo's "let the backoff climb" wait, but state-gated:
    // retry N is scheduled 250ms * 2^(N-1) * jitter (0.5–1) after failure N,
    // so once the 4th failure is logged the next retry is >=1s out and no
    // background retry can fire between disarming the failure and the click.
    await saveFailures.waitForCount(4);
    await sqliteWriteFailure.disarm();
    await retrySaveButton.click();
    await expect(retrySaveButton).toHaveCount(0);
    await expect(log.getByText("Reply after retry save.")).toBeVisible({ timeout: 20_000 });

    mock.enqueueCompletion({ text: "Reply after dismiss save.", chunkBy: "all" });
    await sqliteWriteFailure.arm();
    await sendAssistantMessage(page, "Prompt for dismiss cycle");
    await expect(retrySaveButton).toBeVisible({ timeout: 20_000 });
    await saveFailures.waitForCount(8);
    await sqliteWriteFailure.disarm();
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
    await sqliteWriteFailure.dispose();
    await mock.dispose();
  }
});

test("restores a finished run with its success status after a plain reload", async ({ page }) => {
  test.setTimeout(60_000);

  const mock = await mockOpenAICompatibleProvider({
    defaultCompletion: { text: "Reply that must survive reload.", chunkBy: "all" },
  });

  try {
    await setupApp(page);
    await addLmStudioProfile(page, { baseUrl: mock.baseUrl });
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

  await setupApp(page);
  // WHY: In production the pointer outlives its row (row deleted elsewhere, DB
  // reset). Seeding it before the reload makes the /ai navigation below boot
  // with a stale activeConversationId.
  await page.evaluate(() => window.localStorage.setItem("activeConversationId", "e2e-missing-row"));
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByText("Learned today", { exact: true })).toBeVisible();

  await page.getByRole("link", { name: "Assistant", exact: true }).click();

  // The route picked up the stale pointer instead of creating a conversation…
  await expect(page).toHaveURL(/\/ai\?conversationId=e2e-missing-row($|&)/);
  // …and restoring the missing row lands on an editable fresh conversation
  // instead of staying on the restoring state forever.
  await expect(page.getByRole("heading", { name: "Untitled conversation" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Prompt input" })).toBeVisible();
});

test("types a draft that mints an id, follows the prompt, Untitled when wiped, and deletes without confirmation", async ({
  page,
}) => {
  test.setTimeout(60_000);

  await setupApp(page);
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

  const mock = await mockOpenAICompatibleProvider({
    defaultCompletion: { text: "Reply after the turn.", chunkBy: "all" },
  });

  try {
    await setupApp(page);
    await addLmStudioProfile(page, { baseUrl: mock.baseUrl });
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

  await setupApp(page);
  await openAssistantWithDeck(page);

  const prompt = page.getByRole("textbox", { name: "Prompt input" });
  await prompt.fill("Last active draft");
  const activeId = await waitForConversationIdFromUrl(page);
  const row = sidebarRow(page, "Last active draft");
  await expect(row).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(1_500);

  await openAssistantWithDeck(page);
  await expect(page).toHaveURL(new RegExp(`conversationId=${activeId}($|&)`));
  await expect(row).toBeVisible();
});

test("New conversation stays on the param-less route after a reload", async ({ page }) => {
  test.setTimeout(60_000);

  await setupApp(page);
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

  await setupApp(page);
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
