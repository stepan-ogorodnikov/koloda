import { Titlebar as TitlebarContent } from "@koloda/ui";

const titlebar = [
  "relative flex flex-col",
  "h-(--titlebar-height) w-full border-b-2 border-main bg-body",
  "box-content select-none [-webkit-user-select:none]",
].join(" ");

export function Titlebar() {
  return (
    <div className={titlebar}>
      <div className="flex items-center h-full w-full">
        <TitlebarContent />
      </div>
    </div>
  );
}
