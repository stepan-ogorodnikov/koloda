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

const skippedDirs = new Set(["node_modules", "target", "dist", "tmp", "tasks"]);

function allMarkdown(dir = ""): string[] {
  return readdirSync(join(root, dir), { withFileTypes: true }).flatMap((entry) => {
    if (entry.name.startsWith(".") || skippedDirs.has(entry.name)) return [];
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return allMarkdown(path);
    return entry.name.endsWith(".md") ? [path] : [];
  });
}

function withoutFences(markdown: string): string {
  return markdown.replace(/^(```|~~~)[\s\S]*?^\1.*$/gm, "");
}

function headingsAndLabels(markdown: string): string[] {
  const text = withoutFences(markdown);
  const headings = [...text.matchAll(/^#{1,6} (.+)$/gm)].map((match) => match[1].trim());
  const labels = [...text.matchAll(/^\*\*([^*]+)\*\*/gm)].map((match) => match[1].replace(/[.:]$/, ""));
  return [...headings, ...labels];
}

// WHY: a pointer names a heading by its text, and a longer heading may continue after a colon or a parenthesis
// (`§Self-review` for "Self-review (agent, before the human's ask)").
function resolvesTo(headings: string[], name: string): boolean {
  return headings.some(
    (heading) => heading === name || heading.startsWith(`${name}:`) || heading.startsWith(`${name} (`),
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

  it.each(specs)("%s has a Relationships section inside Core model", (spec) => {
    const markdown = read(spec);
    const core = markdown.indexOf("\n## Core model\n");
    const relationships = markdown.indexOf("\n### Relationships\n");
    const next = markdown.indexOf("\n## ", core + 1);
    expect(relationships).toBeGreaterThan(core);
    expect(next === -1 || relationships < next).toBe(true);
  });

  // WHY: a spec describes behavior and never names code. Source paths and file or symbol syntax are the tell.
  it.each(specs)("%s names no source paths or code symbols", (spec) => {
    const spans = [...withoutFences(read(spec)).matchAll(/`([^`\n]+)`/g)].map((match) => match[1]);
    const code = spans.filter(
      (span) =>
        /\.(ts|tsx|rs|sql|json|toml)$/.test(span) ||
        span.includes("::") ||
        span.endsWith("()") ||
        (span.includes("/") && topLevel.has(span.split("/")[0])),
    );
    expect(code).toEqual([]);
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

describe("section pointers", () => {
  const files = allMarkdown();
  const byName = new Map<string, string[]>();
  for (const file of files) {
    const name = file.split("/").pop() ?? file;
    byName.set(name, [...(byName.get(name) ?? []), file]);
  }

  // `FILE.md (§Heading)` points into FILE.md; a bare `(§Heading)` points into the file it is written in.
  // WHY: a placeholder such as `FILE.md (§Section)` or `(§…)` documents the syntax and points at nothing.
  const pointer = /(?:([\w./-]+\.md)`?\s*)?\((§[^)\n]*)\)/g;

  function targetFile(from: string, named: string | undefined): string | null {
    if (!named) return from;
    if (named.includes("/")) return existsSync(join(root, named)) ? named : null;
    const matches = byName.get(named) ?? [];
    return matches.length === 1 ? matches[0] : null;
  }

  function unresolved(file: string): string[] {
    const problems: string[] = [];
    for (const match of withoutFences(read(file)).matchAll(pointer)) {
      if (match[1] === "FILE.md" || match[2].includes("…")) continue;
      const target = targetFile(file, match[1]);
      if (!target) {
        problems.push(`${match[1]} does not name exactly one file`);
        continue;
      }
      const known = headingsAndLabels(read(target));
      for (const part of match[2].split("§").map((text) => text.trim().replace(/,$/, "").trim())) {
        if (!part) continue;
        // WHY: `(§Field groups and merge, Apply rule)` lists several headings under one pointer.
        const names = resolvesTo(known, part) ? [] : part.split(",").map((name) => name.trim());
        const missing = names.filter((name) => !resolvesTo(known, name));
        if (missing.length > 0) problems.push(`${match[1] ?? "this file"} has no section ${missing.join(", ")}`);
      }
    }
    return problems;
  }

  it.each(files)("%s points only at sections that exist", (file) => {
    expect(unresolved(file)).toEqual([]);
  });
});
