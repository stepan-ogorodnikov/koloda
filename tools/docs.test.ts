import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));

function listMarkdown(dir: string): string[] {
  return readdirSync(join(root, dir))
    .filter((name) => name.endsWith(".md"))
    .map((name) => join(dir, name));
}

function read(relPath: string): string {
  return readFileSync(join(root, relPath), "utf8");
}

// WHY: guides also write shorthand relative to a package (`live/`, `tests/domain/`) and bare package names
// (`@lingui/react`). Only spans that start with a top-level repo entry are repo paths.
const topLevel = new Set(readdirSync(root));

// WHY: placeholders (`<slug>`, `…`), globs (`*`), and ranges (`..`) are not literal paths.
function pathSpans(markdown: string): string[] {
  const spans = [...markdown.matchAll(/`([^`\n]+)`/g)].map((match) => match[1]);
  return spans.filter(
    (span) =>
      span.includes("/") &&
      topLevel.has(span.split("/")[0]) &&
      !/\s/.test(span) &&
      !/[<>*{}§|…]/.test(span) &&
      !span.includes(".."),
  );
}

function sectionBody(markdown: string, heading: string): string | null {
  const lines = markdown.split("\n");
  const start = lines.findIndex((line) => line === `## ${heading}`);
  if (start === -1) return null;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => line.startsWith("## "));
  return (end === -1 ? rest : rest.slice(0, end)).join("\n").trim();
}

describe("agents guides", () => {
  const guides = listMarkdown("agents");

  it.each(guides)("%s names only paths that exist", (guide) => {
    const missing = pathSpans(read(guide)).filter((span) => !existsSync(join(root, span)));
    expect(missing).toEqual([]);
  });
});

describe("functional specs", () => {
  const specs = listMarkdown("docs/specs");

  it.each(specs)("%s opens with Scope, What it is, Core model", (spec) => {
    const headings = read(spec)
      .split("\n")
      .filter((line) => line.startsWith("## "))
      .slice(0, 3);
    expect(headings).toEqual(["## Scope", "## What it is", "## Core model"]);
  });
});

describe("decisions", () => {
  const decisions = listMarkdown("docs/decisions").map((path) => path.split("/").pop() ?? path);
  const playbooks = listMarkdown("agents").map(read).join("\n");

  it.each(decisions)("%s is pointed at from INDEX or a playbook", (decision) => {
    expect(playbooks).toContain(decision);
  });
});

describe("archived tasks", () => {
  const archived = readdirSync(join(root, "tasks/archive"))
    .filter((name) => name.endsWith(".md"))
    .map((name) => join("tasks/archive", name));

  it("has at least one archived task", () => {
    expect(archived.length).toBeGreaterThan(0);
  });

  it.each(archived)("%s is Status: done with a non-empty Outcome", (task) => {
    const markdown = read(task);
    expect(markdown.split("\n")).toContain("Status: done");
    expect(sectionBody(markdown, "Outcome")).toBeTruthy();
  });
});
