import type { PropsWithChildren } from "react";
import "@fontsource-variable/inter";

export function Layout({ children }: PropsWithChildren) {
  return <div className="flex justify-center min-w-screen min-h-screen">{children}</div>;
}
