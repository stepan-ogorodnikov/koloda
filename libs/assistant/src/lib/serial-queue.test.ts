import { describe, expect, it, vi } from "vitest";
import { createSerialQueue, QueueClosedError } from "./serial-queue";

describe("createSerialQueue", () => {
  it("cancel before dequeue skips the task body", async () => {
    const queue = createSerialQueue<void>();
    const task = vi.fn(async () => undefined);

    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    const first = queue.enqueue("a", async () => {
      await gate;
    });
    const second = queue.enqueue("b", task);
    await Promise.resolve();

    expect(queue.cancel("b", "user")).toBe(true);
    release();
    await first;
    await second;

    expect(task).not.toHaveBeenCalled();
  });

  it("close rejects new enqueues and cancels pending", async () => {
    const queue = createSerialQueue<void>();
    const pendingTask = vi.fn(async () => undefined);

    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    const first = queue.enqueue("a", async () => {
      await gate;
    });
    const second = queue.enqueue("b", pendingTask);
    await Promise.resolve();

    const canceled = queue.close("app_shutdown");
    expect(canceled).toEqual(["b"]);
    expect(queue.isClosed).toBe(true);

    release();
    await first;
    await second;
    expect(pendingTask).not.toHaveBeenCalled();

    expect(() => queue.enqueue("c", async () => undefined)).toThrow(QueueClosedError);
  });
});
