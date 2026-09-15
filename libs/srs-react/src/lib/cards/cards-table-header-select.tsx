import type { Card } from "@koloda/srs";
import { Checkbox } from "@koloda/ui";
import type { CardsTableFeatures } from "@koloda/ui";
import type { Table } from "@tanstack/react-table";

export type CardsTableHeaderSelectProps = {
  table: Table<CardsTableFeatures, Card>;
};

export function CardsTableHeaderSelect({ table }: CardsTableHeaderSelectProps) {
  const isAllSelected = table.getIsAllPageRowsSelected();
  const isIndeterminate = table.getIsSomePageRowsSelected() && !isAllSelected;

  const handleChange = (isSelected: boolean) => {
    table.toggleAllPageRowsSelected(isSelected);
  };

  if (table.getRowModel().rows.length === 0) return null;

  return (
    <Checkbox isSelected={isAllSelected} isIndeterminate={isIndeterminate} onChange={handleChange}>
      <Checkbox.Indicator />
    </Checkbox>
  );
}
