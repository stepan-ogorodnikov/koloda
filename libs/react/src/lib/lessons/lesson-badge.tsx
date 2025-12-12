import type { Deck, LessonType } from "@koloda/srs";
import { Button } from "@koloda/ui";
import { useSetAtom } from "jotai";
import { tv } from "tailwind-variants";
import { lessonAtom } from "./lesson";

export const lessonBadge = [
  "group flex items-center w-full h-full text-left hover:bg-button-ghost-hover",
  "cursor-pointer disabled:cursor-default no-focus-ring",
].join(" ");

export const lessonBadgeContent = tv({
  base: [
    "w-full px-2 max-tb:py-2 group-focus-ring rounded-sm",
    "font-semibold text-lg leading-6 group-disabled:fg-level-4 max-tb:text-center",
  ],
  variants: {
    type: {
      untouched: "fg-lesson-type-blue",
      learn: "fg-lesson-type-red",
      review: "fg-lesson-type-green",
      total: "",
    },
  },
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
      className={lessonBadge}
      isDisabled={isDisabled}
      onClick={() => {
        if (Number(value)) setLesson({ type, deckId });
      }}
    >
      <span className={lessonBadgeContent({ type })}>
        {isDisabled ? "0" : value}
      </span>
    </Button>
  );
}
