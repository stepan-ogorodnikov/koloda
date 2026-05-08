import type { PropsWithChildren, ReactNode } from "react";
import "@fontsource-variable/inter";

type LayoutProps = PropsWithChildren<{
  titlebar?: ReactNode;
}>;

export function Layout({ titlebar, children }: LayoutProps) {
  return (
    <div className="flex flex-col min-w-screen min-h-screen h-screen overflow-hidden">
      {titlebar}
      <div className="grow flex flex-col items-center min-h-0 w-full">
        {children}
      </div>
    </div>
  );
}
