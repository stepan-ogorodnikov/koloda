import { describe, expect, it } from "vitest";
import { AppError, getAIHttpErrorMessageDescriptor } from "./error";
import { formatGenerateError, toAIAppError } from "./error-ai";

describe("ai-error", () => {
  const translate = ((message: string) => message) as Parameters<typeof formatGenerateError>[1];

  it("resolves direct and fallback AI http message descriptors", () => {
    expect(getAIHttpErrorMessageDescriptor("ai.http.404")).toBe("ai.http.404");
    expect(getAIHttpErrorMessageDescriptor("ai.http.418")).toBe("ai.http 418");
    expect(getAIHttpErrorMessageDescriptor("db.get")).toBeNull();
  });

  it("maps structured, network, invalid-response, and abort errors", () => {
    expect(toAIAppError({ status: 503, responseBody: "gateway timeout" })).toMatchObject({
      code: "ai.http.503",
      details: "503 — gateway timeout",
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

  it("translates a stored generate error code and keeps details separate", () => {
    expect(formatGenerateError({ message: "ai.http.401", details: "Unauthorized" }, translate)).toEqual({
      message: "ai.http.401",
      details: "Unauthorized",
    });
  });

  it("treats a legacy flattened display string as details behind unknown", () => {
    expect(formatGenerateError({ message: "Provider aborted the request" }, translate)).toEqual({
      message: "unknown",
      details: "Provider aborted the request",
    });
  });

  it("does not promote unknown AppError details into the headline", () => {
    expect(formatGenerateError(new AppError("unknown", "SQLITE_BUSY"), translate)).toEqual({
      message: "unknown",
      details: "SQLITE_BUSY",
    });
  });
});
