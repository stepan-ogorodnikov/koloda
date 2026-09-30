/**
 * Push gate. Runs the web, Rust, and format tracks together and waits for all of them.
 * Web is `check:web-deploy` (oxlint, tsc -b, lib tests, app unit tests, workspace-deps).
 * Rust is clippy, then `koloda` tests, sharing dist/target/koloda.
 * Format is `dprint check`, including rustfmt on `.rs`.
 * Any failure fails the run after every track has finished.
 *
 * Usage: bun run check:push
 */
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import type { ChildProcess } from "node:child_process";
import type { Readable, Writable } from "node:stream";

export type Track = {
  name: string;
  args: readonly string[];
};

export type TrackResult = {
  name: string;
  code: number | null;
};

const tracks: readonly Track[] = [
  { name: "web", args: ["run", "check:web-deploy"] },
  { name: "rust", args: ["run", "check:rust-push"] },
  { name: "format", args: ["run", "check:format"] },
];

function prefix(stream: Readable, label: string, out: Writable): Promise<void> {
  const lines = createInterface({ input: stream });
  return new Promise((resolve, reject) => {
    lines.on("line", (line) => {
      out.write(`[${label}] ${line}\n`);
    });
    lines.once("close", () => resolve());
    stream.once("error", reject);
  });
}

function exitCode(child: ChildProcess): Promise<number | null> {
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code) => resolve(code));
  });
}

export async function runTracks(
  pending: readonly Track[],
  out: Writable = process.stdout,
  err: Writable = process.stderr,
): Promise<TrackResult[]> {
  const children = pending.map((track) => {
    const child = spawn(process.execPath, [...track.args], {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    return { ...track, child };
  });

  const stop = (): void => {
    for (const { child } of children) child.kill();
  };
  const onSigint = (): void => {
    stop();
    process.exit(130);
  };
  const onSigterm = (): void => {
    stop();
    process.exit(143);
  };
  process.on("SIGINT", onSigint);
  process.on("SIGTERM", onSigterm);

  try {
    return await Promise.all(
      children.map(async ({ name, child }) => {
        if (child.stdout == null || child.stderr == null) {
          throw new Error(`${name} stdio was not piped`);
        }
        try {
          const [code] = await Promise.all([
            exitCode(child),
            prefix(child.stdout, name, out),
            prefix(child.stderr, name, err),
          ]);
          return { name, code };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.error(`[${name}] ${message}`);
          return { name, code: 1 };
        }
      }),
    );
  } finally {
    process.off("SIGINT", onSigint);
    process.off("SIGTERM", onSigterm);
  }
}

if (import.meta.main) {
  const results = await runTracks(tracks);
  const failed = results.filter((result) => result.code !== 0);
  if (failed.length === 0) process.exit(0);
  for (const result of failed) {
    console.error(`[${result.name}] exited ${result.code}`);
  }
  process.exit(1);
}
