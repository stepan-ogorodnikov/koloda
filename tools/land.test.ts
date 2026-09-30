import { describe, expect, it } from "vitest";
import { checkState, landingBranch } from "./land.ts";
import type { CheckRun } from "./land.ts";

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

describe("landingBranch", () => {
  it("keeps a task branch", () => {
    expect(landingBranch("task/entity-notes", sha)).toBe("task/entity-notes");
  });

  it("uses a land branch from main or a detached HEAD", () => {
    expect(landingBranch("main", sha)).toBe("land/01234567");
    expect(landingBranch(null, sha)).toBe("land/01234567");
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
