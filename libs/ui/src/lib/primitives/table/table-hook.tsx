import { createTableHook } from "@tanstack/react-table";
import { cardsTableOptions, lessonsTableOptions, selectionTableOptions } from "./table-features";

// WHY: createTableHook binds TFeatures at the hook. A single wide useAppTable would
// force unused features onto simple tables and weaken types/tree-shaking. Pair each
// named preset with its own hook.
const {
  useAppTable: useLessonsTable,
  createAppColumnHelper: createLessonsColumnHelper,
  appFeatures: lessonsFeatures,
} = createTableHook({
  ...lessonsTableOptions,
});

const {
  useAppTable: useSelectionTable,
  createAppColumnHelper: createSelectionColumnHelper,
  appFeatures: selectionFeatures,
} = createTableHook({
  ...selectionTableOptions,
});

const {
  useAppTable: useCardsTable,
  createAppColumnHelper: createCardsColumnHelper,
  appFeatures: cardsFeatures,
} = createTableHook({
  ...cardsTableOptions,
});

export {
  useLessonsTable,
  createLessonsColumnHelper,
  lessonsFeatures,
  useSelectionTable,
  createSelectionColumnHelper,
  selectionFeatures,
  useCardsTable,
  createCardsColumnHelper,
  cardsFeatures,
};
