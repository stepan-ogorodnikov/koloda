import { execFile, spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const __dirname = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(__dirname, "../../..");
// INVARIANT: the `e2e` target builds the server into the target directory the crate's own `test` target uses.
const serverBinary = resolve(
  workspaceRoot,
  "dist/target/koloda/debug",
  process.platform === "win32" ? "koloda-server.exe" : "koloda-server",
);
const STARTUP_TIMEOUT_MS = 15_000;

export type SyncServer = {
  url: string;
  setupToken: string;
  stop: () => Promise<void>;
};

/**
 * A real `koloda-server` on loopback over plain HTTP, which devices accept only for their own machine,
 * with a fresh data directory that `stop` removes.
 */
export async function startSyncServer(): Promise<SyncServer> {
  const dataDir = await mkdtemp(resolve(tmpdir(), "koloda-e2e-server-"));
  const { stdout } = await promisify(execFile)(serverBinary, ["init", "--data-dir", dataDir]);
  const setupToken = /^Setup token: (\S+)$/m.exec(stdout)?.[1];
  if (!setupToken) throw new Error(`koloda-server init printed no setup token:\n${stdout}`);

  const port = await getFreePort();
  // WHY: the free-disk floors default to 1 GiB, so a nearly full disk would hold the space's writes.
  const server = spawn(
    serverBinary,
    [
      "serve",
      "--data-dir",
      dataDir,
      "--insecure-http",
      "--listen",
      `127.0.0.1:${port}`,
      "--min-free-disk",
      "0",
      "--reserve-disk",
      "0",
    ],
    { stdio: ["ignore", "ignore", "pipe"] },
  );
  await waitForListening(server);

  return {
    url: `http://127.0.0.1:${port}`,
    setupToken,
    stop: async () => {
      if (server.exitCode === null && server.signalCode === null) {
        const exited = new Promise((resolve) => server.once("exit", resolve));
        server.kill();
        await exited;
      }
      await rm(dataDir, { recursive: true, force: true });
    },
  };
}

// WHY: `--listen` with port 0 would bind, but the server prints the requested address, not the one it got.
async function getFreePort(): Promise<number> {
  const probe = createServer();
  await new Promise<void>((resolve) => probe.listen(0, "127.0.0.1", resolve));
  const { port } = probe.address() as AddressInfo;
  await new Promise<void>((resolve, reject) => probe.close((error) => (error ? reject(error) : resolve())));
  return port;
}

function waitForListening(server: ChildProcess): Promise<void> {
  return new Promise((resolve, reject) => {
    let log = "";
    const timer = setTimeout(() => {
      server.kill();
      reject(new Error(`koloda-server did not start in ${STARTUP_TIMEOUT_MS} ms:\n${log}`));
    }, STARTUP_TIMEOUT_MS);
    // INVARIANT: stderr stays drained for the server's whole run; a full pipe would block its writes.
    server.stderr?.on("data", (chunk: Buffer) => {
      log += chunk.toString("utf8");
      if (log.includes("koloda-server: listening on")) {
        clearTimeout(timer);
        resolve();
      }
    });
    server.once("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`koloda-server exited with ${code} before it listened:\n${log}`));
    });
    server.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}
