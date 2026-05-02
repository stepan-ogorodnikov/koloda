import { CarouselHorizontal02Icon, TableIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { ToggleGroup } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { atom, useAtom } from "jotai";

export const cardsViewAtom = atom<"table" | "stack">("table");

export function CardsViewToggle() {
  const { _ } = useLingui();
  const [value, setValue] = useAtom(cardsViewAtom);

  return (
    <ToggleGroup
      variants={{ class: "max-tb:hidden" }}
      selectedKeys={[value]}
      onSelectionChange={([value]) => {
        if (value === "table" || value === "stack") setValue(value);
      }}
    >
      <ToggleGroup.Item variants={{ size: "icon" }} aria-label={_(msg`cards.views.table`)} id="table">
        <HugeiconsIcon className="size-5 min-w-5" strokeWidth={1.75} icon={TableIcon} aria-hidden="true" />
      </ToggleGroup.Item>
      <ToggleGroup.Item variants={{ size: "icon" }} aria-label={_(msg`cards.views.stack`)} id="stack">
        <HugeiconsIcon
          className="size-5 min-w-5"
          strokeWidth={1.75}
          icon={CarouselHorizontal02Icon}
          aria-hidden="true"
        />
      </ToggleGroup.Item>
    </ToggleGroup>
  );
}
