import { describe, expect, it } from "vitest";
import { checkState, landingBranch, taskGateProblems, taskSlug } from "./land.ts";
import type { CheckRun, TaskCommit } from "./land.ts";

const sha = "0123456789abcdef0123456789abcdef01234567";

function checkRun(overrides: Partial<CheckRun>): CheckRun {
  return {
    status: "completed",
    conclusion: "success",
    html_url: "https://github.com/o/r/runs/1",
    app: { slug: "github-actions" },
    ...overrides,
  };
}

const slug = "entity-notes";
const live = `tasks/live/${slug}.md`;
const archived = `tasks/archive/${slug}.md`;

const archiveDone = `# Entity notes

Status: done
Guides: none

## Outcome

Notes shipped.
`;

function commit(overrides: Partial<TaskCommit>): TaskCommit {
  return { trailers: [slug], changes: ["M src/app.ts"], ...overrides };
}

const addCommit = commit({ changes: [`A ${live}`] });
const workCommit = commit({});
const archiveCommit = commit({ changes: [`A ${archived}`, `D ${live}`] });
const train = [addCommit, workCommit, archiveCommit];

describe("landingBranch", () => {
  it("keeps a task branch", () => {
    expect(landingBranch("task/entity-notes", sha)).toBe("task/entity-notes");
  });

  it("uses a land branch from main or a detached HEAD", () => {
    expect(landingBranch("main", sha)).toBe("land/01234567");
    expect(landingBranch(null, sha)).toBe("land/01234567");
  });
});

describe("taskSlug", () => {
  it("reads the slug from a task branch", () => {
    expect(taskSlug("task/entity-notes", [])).toBe("entity-notes");
  });

  it("reads the slug from the trailers when the branch is not a task branch", () => {
    expect(taskSlug("main", [commit({})])).toBe("entity-notes");
    expect(taskSlug(null, [commit({})])).toBe("entity-notes");
  });

  it("is null when nothing names a task", () => {
    expect(taskSlug("main", [commit({ trailers: [] })])).toBeNull();
  });
});

describe("taskGateProblems", () => {
  it("passes a train of Add, work, then Archive", () => {
    expect(taskGateProblems(slug, train, archiveDone)).toEqual([]);
  });

  it("rejects a commit without this task's trailer", () => {
    const problems = taskGateProblems(slug, [addCommit, commit({ trailers: [] }), archiveCommit], archiveDone);
    expect(problems).toEqual([expect.stringContaining("commit 2 must carry exactly one")]);
  });

  it("rejects a commit that names another task", () => {
    const problems = taskGateProblems(slug, [addCommit, commit({ trailers: ["other"] }), archiveCommit], archiveDone);
    expect(problems).toEqual([expect.stringContaining("commit 2 must carry exactly one")]);
  });

  it("requires the Add commit to be the oldest", () => {
    const problems = taskGateProblems(slug, [workCommit, addCommit, archiveCommit], archiveDone);
    expect(problems).toEqual([expect.stringContaining("the oldest commit must be the Add commit")]);
  });

  it("requires the Archive commit to be the newest and to move the live file", () => {
    const problems = taskGateProblems(slug, [addCommit, archiveCommit, workCommit], archiveDone);
    expect(problems).toEqual([expect.stringContaining("the newest commit must be the Archive commit")]);
    const noMove = commit({ changes: [`A ${archived}`] });
    expect(taskGateProblems(slug, [addCommit, noMove], archiveDone)).toEqual([
      expect.stringContaining("the newest commit must be the Archive commit"),
    ]);
  });

  it("rejects an archive that is not done or has no Outcome", () => {
    const notDone = archiveDone.replace("Status: done", "Status: ready");
    expect(taskGateProblems(slug, train, notDone)).toEqual([expect.stringContaining("Status: done")]);
    const noOutcome = archiveDone.replace("Notes shipped.", "");
    expect(taskGateProblems(slug, train, noOutcome)).toEqual([expect.stringContaining("fill in Outcome")]);
  });

  it("rejects a tip without the archive file", () => {
    expect(taskGateProblems(slug, train, null)).toEqual([expect.stringContaining("is missing at the tip")]);
  });
});

describe("checkState", () => {
  it("is missing until GitHub Actions reports a run", () => {
    expect(checkState([])).toEqual({ kind: "missing" });
    expect(checkState([checkRun({ app: { slug: "other-app" } })])).toEqual({ kind: "missing" });
  });

  it("is pending while the run is not completed", () => {
    expect(checkState([checkRun({ status: "in_progress", conclusion: null })]).kind).toBe("pending");
  });

  it("passes only on success", () => {
    expect(checkState([checkRun({})]).kind).toBe("success");
    expect(checkState([checkRun({ conclusion: "cancelled" })])).toEqual({
      kind: "failure",
      url: "https://github.com/o/r/runs/1",
      conclusion: "cancelled",
    });
  });
});
