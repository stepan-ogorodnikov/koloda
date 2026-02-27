import type { TWVProps } from "@koloda/ui";
import type { HTMLAttributes } from "react";
import { Heading } from "react-aria-components";
import { tv } from "tailwind-variants";

export const overlay = tv({
  base: [
    "flex items-center justify-center",
    "fixed inset-0 z-10 overflow-y-auto min-h-full p-1 tb:p-4",
    "bg-overlay backdrop-blur-xs",
    "motion:entering:fade-in-0 motion:exiting:fade-out-0",
  ],
});

export const overlayFrame = tv({
  base: [
    "flex flex-col overflow-auto",
    "bg-level-1 fg-level-2 border-2 border-overlay-frame shadow-overlay-frame",
  ],
});

const overlayFrameHeader = tv({ base: "flex flex-row items-center min-h-14 p-2 tb:px-4 border-b-2 border-main" });

type OverlayFrameHeaderProps = HTMLAttributes<HTMLDivElement> & TWVProps<typeof overlayFrameHeader>;

export function OverlayFrameHeader({ variants, ...props }: OverlayFrameHeaderProps) {
  return <div className={overlayFrameHeader(variants)} {...props} />;
}

export function OverlayFrameTitle(props: HTMLAttributes<HTMLHeadingElement>) {
  return <Heading className="fg-level-1 font-semibold" slot="title" {...props} />;
}

export const overlayFrameContent = tv({ base: "grow min-h-0 flex flex-col py-2 px-4" });

type OverlayFrameContentProps = HTMLAttributes<HTMLDivElement> & TWVProps<typeof overlayFrameContent>;

export function OverlayFrameContent({ variants, ...props }: OverlayFrameContentProps) {
  return <div className={overlayFrameContent(variants)} {...props} />;
}

const overlayFrameFooter = tv({
  base: "flex flex-row items-center py-2 px-4 border-t-2 border-main",
  variants: {
    justify: {
      end: "justify-end",
      center: "justify-center",
    },
  },
  defaultVariants: {
    justify: "end",
  },
});

type OverlayFrameFooterProps = HTMLAttributes<HTMLDivElement> & TWVProps<typeof overlayFrameFooter>;

export function OverlayFrameFooter({ variants, ...props }: OverlayFrameFooterProps) {
  return <div className={overlayFrameFooter(variants)} {...props} />;
}
