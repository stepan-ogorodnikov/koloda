import type { Card } from "@koloda/srs";
import { Checkbox } from "@koloda/ui";
import type { Table } from "@tanstack/react-table";

export function CardsTableHeaderSelect({ table }: { table: Table<Card> }) {
  const allRows = table.getRowModel().rows;
  const selectedCount = allRows.filter((row) => row.getIsSelected()).length;
  const isAllSelected = selectedCount === allRows.length;
  const isIndeterminate = selectedCount > 0 && selectedCount < allRows.length;

  const handleChange = (isSelected: boolean) => {
    table.toggleAllRowsSelected(isSelected);
  };

  return (
    <Checkbox
      isSelected={isAllSelected}
      isIndeterminate={isIndeterminate}
      onChange={handleChange}
    >
      <Checkbox.Indicator />
    </Checkbox>
  );
}
