export type ReducerAction<T, State> = {
  [K in keyof T]: T[K] extends (...args: infer A) => any
    ? (A extends [State, infer P2, ...any[]] ? [K, P2] : (A extends [State] ? [K] : never))
    : never;
}[keyof T];

export function dispatchReducerAction<State extends object, Actions extends object>(
  draft: State,
  actions: Actions,
  action: ReducerAction<Actions, State>,
) {
  if (actions[action[0]]) (actions as any)?.[action[0]](draft, action[1]);
}
