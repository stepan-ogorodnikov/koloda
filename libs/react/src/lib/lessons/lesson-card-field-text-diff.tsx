import { Fade } from "@koloda/ui";
import { useMemo } from "react";
import { tv } from "tailwind-variants";

export const lessonCardFieldValue = "max-w-[65ch] w-full break-all";

const textDiffText = tv({
  base: lessonCardFieldValue,
  variants: {
    type: {
      success: "fg-success",
      error: "fg-error",
    },
  },
});

type LessonCardFieldTextDiff = {
  userValue: string;
  correctValue: string;
};

export function LessonCardFieldTextDiff({ userValue, correctValue }: LessonCardFieldTextDiff) {
  const isMatch = useMemo(() => {
    return userValue.trim().toLowerCase() === correctValue.trim().toLowerCase();
  }, [userValue, correctValue]);

  return (
    <Fade className="flex flex-col item-center gap-4" key="diff">
      <span className={textDiffText({ type: isMatch ? "success" : "error" })}>{userValue}</span>
      {!isMatch && <span className={textDiffText()}>{correctValue}</span>}
    </Fade>
  );
}
