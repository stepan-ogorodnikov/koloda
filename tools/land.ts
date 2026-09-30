/**
 * Lands the current branch on main.
 * Rebases onto origin/main, pushes the branch, waits for the CI job `checks`
 * on that exact commit, then fast-forwards main to it.
 * The main ruleset only accepts commits whose `checks` passed, so this is the way onto main.
 * If main moves while checks run, it rebases and checks again. It never force-pushes main.
 *
 * On main or a detached HEAD, the commits are pushed to `land/<short-sha>` for checking.
 * A failed check stops the run; fix, commit, and run it again.
 * On a flake, rerun the failed job (`gh run rerun <id> --failed`), then run it again.
 *
 * Usage: bun run land
 */
import { spawnSync } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

const CHECK = "checks";
const MAX_ATTEMPTS = 5;
const POLL_MS = 10_000;
const START_TIMEOUT_MS = 3 * 60_000;
const RUN_TIMEOUT_MS = 30 * 60_000;

export type CheckRun = {
  status: string;
  conclusion: string | null;
  html_url: string;
  app: { slug: string } | null;
};

export type CheckState =
  | { kind: "missing" }
  | { kind: "pending"; url: string }
  | { kind: "success"; url: string }
  | { kind: "failure"; url: string; conclusion: string };

type Result = { code: number; stdout: string; stderr: string };

export function landingBranch(current: string | null, sha: string): string {
  if (current == null || current === "main") return `land/${sha.slice(0, 8)}`;
  return current;
}

export function checkState(runs: readonly CheckRun[]): CheckState {
  const checkRun = runs.find((item) => item.app?.slug === "github-actions");
  if (checkRun == null) return { kind: "missing" };
  const url = checkRun.html_url;
  if (checkRun.status !== "completed") return { kind: "pending", url };
  if (checkRun.conclusion === "success") return { kind: "success", url };
  return { kind: "failure", url, conclusion: checkRun.conclusion ?? "unknown" };
}

function fail(message: string): never {
  console.error(`land: ${message}`);
  process.exit(1);
}

function run(command: string, args: readonly string[]): Result {
  const result = spawnSync(command, args, { encoding: "utf8", windowsHide: true });
  if (result.error != null) fail(`${command} did not start: ${result.error.message}`);
  return { code: result.status ?? 1, stdout: result.stdout.trim(), stderr: result.stderr.trim() };
}

function git(...args: string[]): string {
  const result = run("git", args);
  if (result.code !== 0) fail(`git ${args.join(" ")} failed:\n${result.stderr || result.stdout}`);
  return result.stdout;
}

function isAncestor(ancestor: string, commit: string): boolean {
  return run("git", ["merge-base", "--is-ancestor", ancestor, commit]).code === 0;
}

function short(sha: string): string {
  return sha.slice(0, 8);
}

function currentBranch(): string | null {
  const result = run("git", ["symbolic-ref", "--quiet", "--short", "HEAD"]);
  return result.code === 0 ? result.stdout : null;
}

function rebaseOntoMain(): void {
  if (isAncestor("origin/main", "HEAD")) return;
  console.log("land: rebasing onto origin/main");
  const result = run("git", ["rebase", "origin/main"]);
  if (result.code === 0) return;
  run("git", ["rebase", "--abort"]);
  fail(
    `rebase onto origin/main has conflicts; run \`git rebase origin/main\`, resolve, then land again.\n${result.stdout}`,
  );
}

function fetchCheckRuns(sha: string): CheckRun[] | null {
  const path = `repos/{owner}/{repo}/commits/${sha}/check-runs?check_name=${CHECK}&filter=latest`;
  const result = run("gh", ["api", path, "--jq", ".check_runs"]);
  if (result.code !== 0) {
    console.error(`land: gh api failed, retrying: ${result.stderr}`);
    return null;
  }
  return JSON.parse(result.stdout) as CheckRun[];
}

async function waitForChecks(sha: string): Promise<void> {
  const started = Date.now();
  let shown = false;
  for (;;) {
    const runs = fetchCheckRuns(sha);
    const state: CheckState = runs == null ? { kind: "missing" } : checkState(runs);
    if (state.kind !== "missing" && !shown) {
      console.log(`land: waiting for \`${CHECK}\` on ${short(sha)}: ${state.url}`);
      shown = true;
    }
    if (state.kind === "success") return;
    if (state.kind === "failure") fail(`\`${CHECK}\` ${state.conclusion} on ${short(sha)}: ${state.url}`);
    const waited = Date.now() - started;
    if (state.kind === "missing" && waited > START_TIMEOUT_MS) {
      fail(`no \`${CHECK}\` run appeared for ${short(sha)}; check the CI workflow triggers.`);
    }
    if (waited > RUN_TIMEOUT_MS) fail(`\`${CHECK}\` still running on ${short(sha)} after 30 minutes.`);
    await sleep(POLL_MS);
  }
}

function finish(branch: string, current: string | null, sha: string): void {
  run("git", ["push", "--quiet", "origin", "--delete", branch]);
  // Moves a local main that is not checked out anywhere; harmless when it cannot.
  if (current !== "main") run("git", ["fetch", "--quiet", "origin", "main:main"]);
  console.log(`land: main is at ${short(sha)}`);
}

export async function land(): Promise<void> {
  if (git("status", "--porcelain", "--untracked-files=no") !== "") {
    fail("the working tree has uncommitted changes; commit or stash them first.");
  }
  const current = currentBranch();
  const branch = landingBranch(current, git("rev-parse", "HEAD"));

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    git("fetch", "--quiet", "origin");
    rebaseOntoMain();
    const sha = git("rev-parse", "HEAD");
    if (git("rev-list", "--count", "origin/main..HEAD") === "0") {
      fail("nothing to land; HEAD is already on origin/main.");
    }

    console.log(`land: pushing ${short(sha)} to ${branch}`);
    git("push", "--quiet", "--force-with-lease", "origin", `HEAD:refs/heads/${branch}`);
    await waitForChecks(sha);

    const pushed = run("git", ["push", "--quiet", "origin", `${sha}:refs/heads/main`]);
    if (pushed.code === 0) {
      finish(branch, current, sha);
      return;
    }
    git("fetch", "--quiet", "origin");
    if (isAncestor("origin/main", sha)) fail(`main rejected ${short(sha)}:\n${pushed.stderr}`);
    console.log("land: main moved while checks ran; rebasing and checking again");
  }
  fail(`main kept moving; gave up after ${MAX_ATTEMPTS} attempts.`);
}

if (import.meta.main) {
  await land();
}
