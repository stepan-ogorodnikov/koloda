import { Writable } from "node:stream";
import { describe, expect, it } from "vitest";
import { runTracks } from "./check-push.ts";
import type { TrackResult } from "./check-push.ts";

function collect(): { stream: Writable; text: () => string } {
  let body = "";
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      body += String(chunk);
      callback();
    },
  });
  return { stream, text: () => body };
}

function byName(results: TrackResult[], name: string): TrackResult {
  const result = results.find((item) => item.name === name);
  if (result == null) throw new Error(`missing track ${name}`);
  return result;
}

describe("runTracks", () => {
  it("waits for a slow success after the other track has already failed", async () => {
    const stdout = collect();
    const stderr = collect();
    const marker = `check-push-${Date.now()}`;
    const results = await runTracks(
      [
        {
          name: "slow",
          args: ["-e", `setTimeout(() => { console.log(${JSON.stringify(marker)}); process.exit(0); }, 200)`],
        },
        { name: "bad", args: ["-e", "console.error('broke'); process.exit(2)"] },
      ],
      stdout.stream,
      stderr.stream,
    );

    expect(byName(results, "slow").code).toBe(0);
    expect(byName(results, "bad").code).toBe(2);
    expect(stdout.text()).toContain(`[slow] ${marker}`);
    expect(stderr.text()).toContain("[bad] broke");
  });
});
