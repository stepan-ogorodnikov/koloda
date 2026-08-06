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
  tableFeatures,
  tableOptions,
} from "@tanstack/react-table";

// WHY: Table.Head/Body call getSize / sorting / pinned-row APIs; every consumer preset must include these.
export const appTableBaseFeatures = tableFeatures({
  columnSizingFeature,
  columnVisibilityFeature,
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns: { alphanumeric: sortFn_alphanumeric },
  rowPinningFeature,
});

export const cardsTableFeatures = tableFeatures({
  columnSizingFeature,
  columnVisibilityFeature,
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns: { alphanumeric: sortFn_alphanumeric },
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
  sortFns: { alphanumeric: sortFn_alphanumeric },
  rowPinningFeature,
});

export const selectionTableFeatures = tableFeatures({
  columnSizingFeature,
  columnVisibilityFeature,
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns: { alphanumeric: sortFn_alphanumeric },
  rowPinningFeature,
  rowSelectionFeature,
});

export const appTableFeatures = tableFeatures({
  columnSizingFeature,
  columnVisibilityFeature,
  columnResizingFeature,
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns: { alphanumeric: sortFn_alphanumeric },
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

export const appTableOptions = tableOptions({
  features: appTableFeatures,
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

export type AppTableBaseFeatures = typeof appTableBaseFeatures;
export type CardsTableFeatures = typeof cardsTableFeatures;
export type LessonsTableFeatures = typeof lessonsTableFeatures;
export type SelectionTableFeatures = typeof selectionTableFeatures;
export type AppTableFeatures = typeof appTableFeatures;
