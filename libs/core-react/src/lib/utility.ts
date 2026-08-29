export type ReducerAction<T, State> = {
  [K in keyof T]: T[K] extends (...args: infer A) => any
    ? A extends [State, infer P2, ...any[]]
      ? [K, P2]
      : A extends [State]
        ? [K]
        : never
    : never;
}[keyof T];

export function dispatchReducerAction<State extends object, Actions extends object>(
  draft: State,
  actions: Actions,
  action: ReducerAction<Actions, State>,
) {
  const handler = (actions as Record<string, ((draft: State, payload: unknown) => void) | undefined>)[
    action[0] as string
  ];
  // WHY: fail loud instead of silently dropping " an unrecognized action name
  // means the event-to-action adapter or the caller drifted from the map.
  if (!handler) throw new Error(`Unknown reducer action: ${String(action[0])}`);
  handler(draft, action[1]);
}
