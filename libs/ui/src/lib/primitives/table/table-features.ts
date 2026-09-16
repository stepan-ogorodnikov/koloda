import {
  columnFilteringFeature,
  columnOrderingFeature,
  columnResizingFeature,
  columnSizingFeature,
  columnVisibilityFeature,
  createFilteredRowModel,
  createPaginatedRowModel,
  createSortedRowModel,
  filterFn_includesString,
  globalFilteringFeature,
  rowPaginationFeature,
  rowPinningFeature,
  rowSelectionFeature,
  rowSortingFeature,
  sortFn_alphanumeric,
  sortFn_datetime,
  sortFn_text,
  tableFeatures,
  tableOptions,
} from "@tanstack/react-table";

export const cardsTableFeatures = tableFeatures({
  columnSizingFeature,
  columnVisibilityFeature,
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  // WHY: sortFn auto resolves content strings to "text" and Date columns (dueAt/createdAt/updatedAt) to "datetime".
  sortFns: { alphanumeric: sortFn_alphanumeric, text: sortFn_text, datetime: sortFn_datetime },
  rowPinningFeature,
  columnFilteringFeature,
  globalFilteringFeature,
  filteredRowModel: createFilteredRowModel(),
  filterFns: { includesString: filterFn_includesString },
  rowPaginationFeature,
  paginatedRowModel: createPaginatedRowModel(),
  rowSelectionFeature,
  columnOrderingFeature,
});

export const lessonsTableFeatures = tableFeatures({
  columnSizingFeature,
  columnVisibilityFeature,
  columnResizingFeature,
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  // WHY: sortFn auto resolves plain string columns to "text"; title is string|null.
  sortFns: { alphanumeric: sortFn_alphanumeric, text: sortFn_text },
  rowPinningFeature,
});

export const selectionTableFeatures = tableFeatures({
  columnSizingFeature,
  columnVisibilityFeature,
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  // WHY: sortFn auto resolves plain string field columns to "text".
  sortFns: { alphanumeric: sortFn_alphanumeric, text: sortFn_text },
  rowPinningFeature,
  rowSelectionFeature,
});

export const cardsTableOptions = tableOptions({
  features: cardsTableFeatures,
  autoResetPageIndex: false,
});

export const lessonsTableOptions = tableOptions({
  features: lessonsTableFeatures,
  enableColumnResizing: true,
  columnResizeMode: "onChange",
  keepPinnedRows: true,
});

export const selectionTableOptions = tableOptions({
  features: selectionTableFeatures,
});

export type CardsTableFeatures = typeof cardsTableFeatures;
export type SelectionTableFeatures = typeof selectionTableFeatures;
