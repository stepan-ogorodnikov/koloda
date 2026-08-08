/**
 * Serializes async work so each task starts only after the prior one settles
 * (success or failure). Used per conversation runtime for run commands.
 */
export function createSerialQueue<T>(): {
  enqueue: (task: () => Promise<T>) => Promise<T>;
} {
  let tail: Promise<void> = Promise.resolve();

  return {
    enqueue(task) {
      const result = tail.then(() => task());
      tail = result.then(
        () => undefined,
        () => undefined,
      );
      return result;
    },
  };
}
