import type { Card } from "@koloda/srs";
import { Checkbox, tableCellContent } from "@koloda/ui";
import type { Row } from "@tanstack/react-table";

export function CardsTableCellSelect({ row }: { row: Row<Card> }) {
  const isSelected = row.getIsSelected();
  const isSelectable = row.getCanSelect();

  return (
    <div className={tableCellContent()}>
      <Checkbox
        isSelected={isSelected}
        isDisabled={!isSelectable}
        onChange={(selected) => {
          row.toggleSelected(selected);
        }}
      >
        <Checkbox.Indicator />
      </Checkbox>
    </div>
  );
}
