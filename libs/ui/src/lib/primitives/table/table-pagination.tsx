import { Button, Label, Select } from "@koloda/ui";
import type { ButtonProps } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import type { Table } from "@tanstack/react-table";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";

type TablePaginationProps = {
  table: Table<any>;
  pageSizes: number[];
  totalCount: number;
};

export function TablePagination({ table, pageSizes, totalCount }: TablePaginationProps) {
  const { _ } = useLingui();
  const { pagination } = table.getState();
  const startIndex = pagination.pageIndex * pagination.pageSize + 1;
  const endIndex = Math.min((pagination.pageIndex + 1) * pagination.pageSize, totalCount);
  const pageCount = table.getPageCount();
  const currentPage = pagination.pageIndex + 1;
  let startPage = Math.max(1, currentPage - 2);
  let endPage = Math.min(pageCount, startPage + 4);
  if (endPage - startPage < 4) startPage = Math.max(1, endPage - 4);
  const pageNumbers = Array.from({ length: endPage - startPage + 1 }, (_, i) => (startPage + i));

  const handlePageSizeChange = (size: string | number | null) => {
    if (typeof size === "number") table.setPageSize(size);
  };

  const goToPage = (pageIndex: number) => {
    table.setPageIndex(pageIndex);
  };

  return (
    <div className="grow flex items-center justify-between">
      <div className="flex flex-row items-center gap-2 fg-level-2">
        <div className="flex flex-row gap-0.5">
          <span className="numbers-text text-base">{startIndex}</span>
          <span className="fg-level-4">-</span>
          <span className="numbers-text text-base">{endIndex}</span>
        </div>
        <span className="fg-level-4">{_(msg`table.pagination.records.label`)}</span>
        <span className="numbers-text text-base">{totalCount}</span>
      </div>
      <div className="flex flex-row item-center gap-8">
        {pageNumbers.length > 1 && (
          <div className="flex items-center space-x-2">
            <TablePaginationButton
              onClick={() => goToPage(0)}
              isDisabled={currentPage === 1}
            >
              <ChevronsLeft className="size-5 min-w-5 stroke-2" />
            </TablePaginationButton>
            <TablePaginationButton
              onClick={() => table.previousPage()}
              isDisabled={!table.getCanPreviousPage()}
            >
              <ChevronLeft className="size-4 min-w-4 stroke-2.5" />
            </TablePaginationButton>
            <div className="w-8 numbers-text text-center fg-level-2">{currentPage}</div>
            <TablePaginationButton
              onClick={() => table.nextPage()}
              isDisabled={!table.getCanNextPage()}
            >
              <ChevronRight className="size-4 min-w-4 stroke-2.5" />
            </TablePaginationButton>
            <TablePaginationButton
              onClick={() => goToPage(pageCount - 1)}
              isDisabled={currentPage === pageCount}
            >
              <ChevronsRight className="size-5 min-w-5 stroke-2" />
            </TablePaginationButton>
          </div>
        )}
        <Select.Root
          variants={{ class: "flex flex-row gap-2" }}
          onSelectionChange={handlePageSizeChange}
          selectedKey={pagination.pageSize}
        >
          <Label variants={{ class: "font-semibold fg-level-2 whitespace-nowrap" }}>
            {_(msg`table.pagination.page-size.label`)}
          </Label>
          <Select.Button />
          <Select.Popover variants={{ class: "w-16" }} placement="bottom right">
            <Select.ListBox>
              {pageSizes.map((size) => (
                <Select.ListBoxItem key={size} id={size}>
                  {size}
                </Select.ListBoxItem>
              ))}
            </Select.ListBox>
          </Select.Popover>
        </Select.Root>
      </div>
    </div>
  );
}

function TablePaginationButton(props: ButtonProps) {
  return (
    <Button
      variants={{
        style: "bordered",
        size: "icon",
        class: "numbers-text fg-level-3",
      }}
      {...props}
    />
  );
}
