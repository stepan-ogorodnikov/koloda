import { langAtom } from "@koloda/core-react";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { render, screen } from "@testing-library/react";
import { createStore, Provider as JotaiProvider } from "jotai";
import type { RecordLogItem } from "ts-fsrs";
import { describe, expect, it } from "vitest";
import { LessonCardGrades } from "./lesson-card-grades";

i18n.loadAndActivate({ locale: "en", messages: {} });

const TEN_MINUTES_GRADE = {
  card: { due: new Date("2024-01-01T00:10:00.000Z") },
  log: { review: new Date("2024-01-01T00:00:00.000Z") },
} as unknown as RecordLogItem;

describe("LessonCardGrades", () => {
  it.each([
    { lang: "en", interval: "10 minutes" },
    { lang: "ru", interval: "10 минут" },
  ])("shows the grade interval in the $lang interface", ({ lang, interval }) => {
    const store = createStore();
    store.set(langAtom, lang);

    render(
      <I18nProvider i18n={i18n}>
        <JotaiProvider store={store}>
          <LessonCardGrades grades={[TEN_MINUTES_GRADE]} />
        </JotaiProvider>
      </I18nProvider>,
    );

    expect(screen.getByText(interval)).toBeTruthy();
  });
});
