import { describe, expect, it } from "vitest";
import { createSpaceSchema } from "./sync-forms";

function spaceNameIssues(spaceName: string) {
  const result = createSpaceSchema.safeParse({
    serverUrl: "https://s.test",
    setupToken: "t",
    spaceName,
    deviceName: "Laptop",
  });
  return result.success ? [] : result.error.issues.map((issue) => issue.message);
}

describe("sync name rule", () => {
  it.each([
    ["100 characters outside the BMP", "😀".repeat(100), []],
    ["101 characters outside the BMP", "😀".repeat(101), ["validation.sync.name.too-long"]],
    ["100 plain characters", "a".repeat(100), []],
    ["101 plain characters", "a".repeat(101), ["validation.sync.name.too-long"]],
  ])("counts characters as the server does: %s", (_case, name, issues) => {
    expect(spaceNameIssues(name)).toEqual(issues);
  });
});
