import type { PropsWithChildren } from "react";

export function AIChatFooter({ children }: PropsWithChildren) {
  return (
    <div className={"self-center flex flex-row items-center shrink-0 w-full max-w-3xl my-2 px-1"}>
      {children}
    </div>
  );
}
