import { describe, expect, it } from "vitest";
import { getAIHttpErrorMessageDescriptor, toAIAppError } from "./ai-error";

describe("ai-error", () => {
  it("resolves direct and fallback AI http message descriptors", () => {
    expect(getAIHttpErrorMessageDescriptor("ai.http.404")).toBe("ai.http.404");
    expect(getAIHttpErrorMessageDescriptor("ai.http.418")).toBe("ai.http 418");
    expect(getAIHttpErrorMessageDescriptor("db.get")).toBeNull();
  });

  it("maps structured, network, invalid-response, and abort errors", () => {
    expect(toAIAppError({ status: 503, responseBody: "gateway timeout" })).toMatchObject({
      code: "ai.http.503",
      details: "gateway timeout",
    });
    expect(toAIAppError(new TypeError("network down"))).toMatchObject({
      code: "ai.network",
      details: "network down",
    });
    expect(toAIAppError(new SyntaxError("bad json"))).toMatchObject({
      code: "ai.invalid-response",
      details: "bad json",
    });
    expect(() => toAIAppError(new DOMException("Aborted", "AbortError"))).toThrow("Aborted");
  });
});
