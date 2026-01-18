import { useMemo } from "react";
import { tv } from "tailwind-variants";

export const lessonCardContentFieldValue = "max-w-[65ch] w-full break-all";

const textDiffText = tv({
  base: lessonCardContentFieldValue,
  variants: {
    type: {
      success: "fg-success",
      error: "fg-error",
    },
  },
});

type LessonCardContentFieldTextDiff = {
  userValue: string;
  correctValue: string;
};

export function LessonCardContentFieldTextDiff({ userValue, correctValue }: LessonCardContentFieldTextDiff) {
  const isMatch = useMemo(() => {
    return userValue.trim().toLowerCase() === correctValue.trim().toLowerCase();
  }, [userValue, correctValue]);

  return (
    <>
      <span className={textDiffText({ type: isMatch ? "success" : "error" })}>{userValue}</span>
      {!isMatch && <span className={textDiffText()}>{correctValue}</span>}
    </>
  );
}
