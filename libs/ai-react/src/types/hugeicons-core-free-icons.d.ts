// WHY: deep per-icon imports (`@hugeicons/core-free-icons/<Icon>`) keep vitest
// from re-loading the ~11k-module barrel in every isolated test file, but the
// package's `./*` types mapping points at per-icon d.ts files that do not
// exist, so the ambient declarations live here. Each per-icon module exports
// the icon as its default; the shape mirrors the barrel's `IconSvgObject` via
// the assignable `IconSvgElement` from `@hugeicons/react`.
declare module "@hugeicons/core-free-icons/Add01Icon" {
  import type { IconSvgElement } from "@hugeicons/react";
  const Add01Icon: IconSvgElement;
  export default Add01Icon;
}
declare module "@hugeicons/core-free-icons/Refresh04Icon" {
  import type { IconSvgElement } from "@hugeicons/react";
  const Refresh04Icon: IconSvgElement;
  export default Refresh04Icon;
}
declare module "@hugeicons/core-free-icons/Cancel01Icon" {
  import type { IconSvgElement } from "@hugeicons/react";
  const Cancel01Icon: IconSvgElement;
  export default Cancel01Icon;
}
declare module "@hugeicons/core-free-icons/ArrowDown02Icon" {
  import type { IconSvgElement } from "@hugeicons/react";
  const ArrowDown02Icon: IconSvgElement;
  export default ArrowDown02Icon;
}
declare module "@hugeicons/core-free-icons/Settings01Icon" {
  import type { IconSvgElement } from "@hugeicons/react";
  const Settings01Icon: IconSvgElement;
  export default Settings01Icon;
}
declare module "@hugeicons/core-free-icons/ArrowUp02Icon" {
  import type { IconSvgElement } from "@hugeicons/react";
  const ArrowUp02Icon: IconSvgElement;
  export default ArrowUp02Icon;
}
declare module "@hugeicons/core-free-icons/StopIcon" {
  import type { IconSvgElement } from "@hugeicons/react";
  const StopIcon: IconSvgElement;
  export default StopIcon;
}
declare module "@hugeicons/core-free-icons/AlertCircleIcon" {
  import type { IconSvgElement } from "@hugeicons/react";
  const AlertCircleIcon: IconSvgElement;
  export default AlertCircleIcon;
}
declare module "@hugeicons/core-free-icons/ChevronRightIcon" {
  import type { IconSvgElement } from "@hugeicons/react";
  const ChevronRightIcon: IconSvgElement;
  export default ChevronRightIcon;
}
declare module "@hugeicons/core-free-icons/FolderLibraryIcon" {
  import type { IconSvgElement } from "@hugeicons/react";
  const FolderLibraryIcon: IconSvgElement;
  export default FolderLibraryIcon;
}
declare module "@hugeicons/core-free-icons/InvestigationIcon" {
  import type { IconSvgElement } from "@hugeicons/react";
  const InvestigationIcon: IconSvgElement;
  export default InvestigationIcon;
}
declare module "@hugeicons/core-free-icons/Wrench01Icon" {
  import type { IconSvgElement } from "@hugeicons/react";
  const Wrench01Icon: IconSvgElement;
  export default Wrench01Icon;
}
