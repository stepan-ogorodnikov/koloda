import { expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { test } from "./fixtures";
import { clickSwitch, createAlgorithm, createTemplate, openLearningSettings, openSection } from "@koloda/e2e";
import { setupApp, setupPageDefaults } from "./helpers";

test.beforeEach(async ({ page }) => {
  await setupPageDefaults(page);
});

test("validates and resets the learning settings form", async ({ page }) => {
  await setupApp(page);

  await createAlgorithm(page, "Test Algorithm");
  await createTemplate(page, "Test Template");
  await openLearningSettings(page);

  const totalField = page.getByRole("textbox", { name: "Total" });
  const learnField = page.getByRole("textbox", { name: "Learn" });
  const reviewField = page.getByRole("textbox", { name: "Review" });
  const hoursField = page.getByRole("textbox", { name: "Hours" });
  const minutesField = page.getByRole("textbox", { name: "Minutes" });
  const newField = page.getByRole("textbox", { name: "New" });
  const saveButton = page.locator("form").getByRole("button", { name: "Save", exact: true });
  const learnSwitch = page.getByRole("switch", { name: "Learn counts towards total" });
  const learnUnlimited = page.getByRole("switch", { name: "Learn unlimited" });

  const initialAlgorithm = await page.getByRole("button", { name: "Default algorithm" }).innerText();
  const initialTemplate = await page.getByRole("button", { name: "Default template" }).innerText();
  await expect(learnUnlimited).toBeChecked();
  const initialHours = await hoursField.inputValue();
  const initialMinutes = await minutesField.inputValue();

  await totalField.click();
  await totalField.fill("5");
  await totalField.blur();

  await saveButton.scrollIntoViewIfNeeded();
  await saveButton.click();
  await expect(page.getByText("New can't be more than total")).toBeVisible();

  await clickSwitch(learnUnlimited);
  await learnField.click();
  await learnField.fill("10");
  await learnField.blur();

  await clickSwitch(learnSwitch);

  await saveButton.scrollIntoViewIfNeeded();
  await saveButton.click();
  await expect(page.getByText("Learn can't be more than total")).toBeVisible();

  await reviewField.click();
  await reviewField.fill("10");
  await reviewField.blur();

  await saveButton.scrollIntoViewIfNeeded();
  await saveButton.click();
  await expect(page.getByText("Review can't be more than total")).toBeVisible();

  await reviewField.click();
  await reviewField.fill("0");
  await reviewField.blur();
  await newField.click();
  await newField.fill("5");
  await newField.blur();

  await clickSwitch(learnSwitch);
  await expect(learnSwitch).not.toBeChecked();

  await saveButton.scrollIntoViewIfNeeded();
  await saveButton.click();
  await expect(saveButton).toBeHidden();
  await expect(page.getByText("can't be more than total")).not.toBeVisible();

  await page.getByRole("button", { name: "Default algorithm" }).click();
  await page.getByRole("option", { name: "Test Algorithm", exact: true }).click();

  await page.getByRole("button", { name: "Default template" }).click();
  await page.getByRole("option", { name: "Test Template", exact: true }).click();

  await newField.click();
  await newField.fill("20");
  await newField.blur();
  await learnField.click();
  await learnField.fill("15");
  await learnField.blur();
  await reviewField.click();
  await reviewField.fill("35");
  await reviewField.blur();

  await hoursField.click();
  await hoursField.fill("2");
  await hoursField.blur();

  await minutesField.click();
  await minutesField.fill("45");
  await minutesField.blur();

  const discardButton = page.locator("form").getByRole("button", { name: "Discard", exact: true });
  await expect(discardButton).toBeVisible();
  await discardButton.click();

  await expect(page.getByRole("button", { name: "Default algorithm" })).toContainText(initialAlgorithm);
  await expect(page.getByRole("button", { name: "Default template" })).toContainText(initialTemplate);
  await expect(totalField).toHaveValue("5");
  await expect(newField).toHaveValue("5");
  await expect(learnUnlimited).not.toBeChecked();
  await expect(learnField).toHaveValue("10");
  await expect(reviewField).toHaveValue("0");
  await expect(hoursField).toHaveValue(initialHours);
  await expect(minutesField).toHaveValue(initialMinutes);
});

test("unlimited total allows a counted cap above any previous total", async ({ page }) => {
  await setupApp(page);

  await createAlgorithm(page, "Test Algorithm");
  await createTemplate(page, "Test Template");
  await openLearningSettings(page);

  const newField = page.getByRole("textbox", { name: "New" });
  const saveButton = page.locator("form").getByRole("button", { name: "Save", exact: true });
  const totalUnlimited = page.getByRole("switch", { name: "Total unlimited" });

  await clickSwitch(totalUnlimited);
  await expect(totalUnlimited).toBeChecked();
  await expect(page.getByRole("textbox", { name: "Total" })).toBeDisabled();

  await newField.click();
  await newField.fill("999");
  await newField.blur();

  await saveButton.scrollIntoViewIfNeeded();
  await saveButton.click();
  await expect(saveButton).toBeHidden();
  await expect(page.getByText("New can't be more than total")).not.toBeVisible();
});

test("hard-zero total rejects a counted cap above zero", async ({ page }) => {
  await setupApp(page);

  await createAlgorithm(page, "Test Algorithm");
  await createTemplate(page, "Test Template");
  await openLearningSettings(page);

  const totalField = page.getByRole("textbox", { name: "Total" });
  const newField = page.getByRole("textbox", { name: "New" });
  const reviewField = page.getByRole("textbox", { name: "Review" });
  const saveButton = page.locator("form").getByRole("button", { name: "Save", exact: true });

  await totalField.click();
  await totalField.fill("0");
  await totalField.blur();
  await newField.click();
  await newField.fill("1");
  await newField.blur();
  await reviewField.click();
  await reviewField.fill("0");
  await reviewField.blur();

  await saveButton.scrollIntoViewIfNeeded();
  await saveButton.click();
  await expect(page.getByText("New can't be more than total")).toBeVisible();
});

test("shows a saved limit on the Dashboard and keeps the day start after a reload", async ({ page }) => {
  await setupApp(page);

  // Load today's progress first, so the Dashboard holds it in the query cache
  await expectDashboardLimit(page, "New", "50");

  await openLearningSettings(page);
  const newField = page.getByRole("textbox", { name: "New" });
  await newField.click();
  await newField.fill("10");
  await newField.blur();

  const dayStartHour = page.getByRole("spinbutton", { name: /hour/i });
  await expect(dayStartHour).toHaveAttribute("aria-valuenow", "5");
  await dayStartHour.focus();
  await dayStartHour.press("ArrowUp");
  await expect(dayStartHour).toHaveAttribute("aria-valuenow", "6");

  const saveButton = page.locator("form").getByRole("button", { name: "Save", exact: true });
  await saveButton.scrollIntoViewIfNeeded();
  await saveButton.click();
  await expect(saveButton).toBeHidden();

  // No reload: the save itself refreshes today's progress
  await expectDashboardLimit(page, "New", "10");

  // Reload, so the form reads the stored day start rather than the query cache
  await page.reload({ waitUntil: "domcontentloaded" });
  await openLearningSettings(page);
  await expect(page.getByRole("spinbutton", { name: /hour/i })).toHaveAttribute("aria-valuenow", "6");
});

// Today's progress on the Dashboard: a type row's daily limit.
async function expectDashboardLimit(page: Page, type: string, limit: string) {
  await openSection(page, "Dashboard");
  const row = page.getByText(type, { exact: true }).first().locator("..");
  await expect(row.getByText(limit, { exact: true })).toBeVisible();
}
