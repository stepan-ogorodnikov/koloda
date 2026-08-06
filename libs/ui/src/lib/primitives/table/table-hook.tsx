import { createTableHook, createTableHookContexts } from "@tanstack/react-table";
import { appTableFeatures, appTableOptions } from "./table-features";

const { tableContext, cellContext, headerContext, useTableContext, useCellContext, useHeaderContext } =
  createTableHookContexts<typeof appTableFeatures>();

const { useAppTable, createAppColumnHelper, appFeatures } = createTableHook({
  ...appTableOptions,
  features: appTableFeatures,
  tableContext,
  cellContext,
  headerContext,
});

export { useAppTable, createAppColumnHelper, appFeatures, useTableContext, useCellContext, useHeaderContext };
