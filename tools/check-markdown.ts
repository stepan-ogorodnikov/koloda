/**
 * Advisory: prose lines over 120 characters in markdown files this branch
 * changed (`agents/MARKDOWN.md` § Line Length). Prints a warning per line and
 * always exits 0, so it never blocks a commit, push, or landing.
 *
 * Skipped on purpose: fenced code, table rows, reference-link definitions,
 * and lines with no spaces (a bare URL or path cannot be split).
 *
 * Usage: bun run tools/check-markdown.ts [file ...]
 *   With no arguments, checks .md files changed against origin/main (or main)
 *   plus uncommitted edits.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const LIMIT = 120;
const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function git(args: string[]): string[] {
  const proc = Bun.spawnSync(["git", ...args], { cwd: root, stdout: "pipe", stderr: "pipe" });
  if (proc.exitCode !== 0) return [];
  return proc.stdout.toString().split("\n").filter(Boolean);
}

function baseRef(): string | null {
  for (const ref of ["origin/main", "main"]) {
    if (git(["rev-parse", "--verify", "--quiet", ref]).length > 0) return ref;
  }
  return null;
}

function changedMarkdown(): string[] {
  const base = baseRef();
  const committed = base ? git(["diff", "--name-only", "--diff-filter=d", `${base}...HEAD`]) : [];
  const uncommitted = git(["diff", "--name-only", "--diff-filter=d", "HEAD"]);
  const untracked = git(["ls-files", "--others", "--exclude-standard"]);
  return [...new Set([...committed, ...uncommitted, ...untracked])].filter((file) => file.endsWith(".md"));
}

function isExempt(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.startsWith("|") || /^\[[^\]]+\]:\s/.test(trimmed) || !/\s/.test(trimmed);
}

function longProseLines(file: string): { line: number; length: number }[] {
  const found: { line: number; length: number }[] = [];
  let inFence = false;
  readFileSync(join(root, file), "utf8")
    .split("\n")
    .forEach((text: string, index: number) => {
      if (/^\s*(```|~~~)/.test(text)) {
        inFence = !inFence;
        return;
      }
      if (inFence || isExempt(text) || text.length <= LIMIT) return;
      found.push({ line: index + 1, length: text.length });
    });
  return found;
}

const files = process.argv.length > 2 ? process.argv.slice(2) : changedMarkdown();
let warnings = 0;
for (const file of files) {
  for (const { line, length } of longProseLines(file)) {
    console.warn(`warning: ${file}:${line} is ${length} characters (guide limit ${LIMIT})`);
    warnings += 1;
  }
}

console.log(
  warnings === 0
    ? `Markdown line length: no long prose lines in ${files.length} changed file(s).`
    : `Markdown line length: ${warnings} long prose line(s). Advisory only; see agents/MARKDOWN.md.`,
);
process.exit(0);
