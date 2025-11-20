import type { Deck, LessonType } from "@koloda/srs";
import { Button, tableCell } from "@koloda/ui";
import { useSetAtom } from "jotai";
import { tv } from "tailwind-variants";
import { lessonAtom } from "./lesson";

export const lessonBadge = tv({
  extend: tableCell,
  base: ["group w-full text-left hover:bg-button-ghost-hover", "cursor-pointer disabled:cursor-default no-focus-ring"],
});

type LessonBadgeProps = {
  type: LessonType;
  value: string | null;
  deckId: Deck["id"] | null;
};

export function LessonBadge({ type, value, deckId }: LessonBadgeProps) {
  const setLesson = useSetAtom(lessonAtom);
  const isDisabled = !Number(value);

  return (
    <Button
      className={lessonBadge()}
      isDisabled={isDisabled}
      onClick={() => {
        if (Number(value)) setLesson({ type, deckId });
      }}
    >
      <div
        className="w-full px-2 group-focus-ring rounded-sm font-semibold text-lg leading-6 data-disabled:fg-level-4"
        data-disabled={isDisabled || undefined}
      >
        {isDisabled ? "0" : value}
      </div>
    </Button>
  );
}
