import { describe, expect, it } from "vitest";
import { AIError, getAIHttpErrorCode, isAIError, throwForAIResponse, toAIError, wrapAIError } from "./error";

describe("error", () => {
  it("constructs AIError with code and optional message", () => {
    const error = new AIError("test.code", "Test message");
    expect(error.code).toBe("test.code");
    expect(error.message).toBe("Test message");
    expect(error.name).toBe("AIError");

    const error2 = new AIError("test.code");
    expect(error2.message).toBe("test.code");
  });

  it("identifies AIError instances", () => {
    expect(isAIError(new AIError("test"))).toBe(true);
    expect(isAIError(new Error("test"))).toBe(false);
    expect(isAIError(null)).toBe(false);
  });

  it("returns correct http error code", () => {
    expect(getAIHttpErrorCode(404)).toBe("ai.http.404");
    expect(getAIHttpErrorCode(500)).toBe("ai.http.500");
  });

  it("throws an AIError for failed AI responses", () => {
    const response = new Response("ok", { status: 200 });
    expect(throwForAIResponse(response)).toBe(response);

    try {
      throwForAIResponse(
        new Response("rate limited", {
          status: 429,
          statusText: "Too Many Requests",
        }),
      );
    } catch (error) {
      expect(error).toBeInstanceOf(AIError);
      expect(error).toMatchObject({
        code: "ai.http.429",
        message: "429 Too Many Requests",
      });
    }
  });

  it("maps structured, network, and invalid-response errors", () => {
    const err1 = toAIError({ status: 503, responseBody: "gateway timeout" });
    expect(err1).toBeInstanceOf(AIError);
    expect(err1).toMatchObject({
      code: "ai.http.503",
      message: "gateway timeout",
    });

    const err2 = toAIError(new TypeError("network down"));
    expect(err2).toBeInstanceOf(AIError);
    expect(err2).toMatchObject({
      code: "ai.network",
      message: "network down",
    });

    const err3 = toAIError(new SyntaxError("bad json"));
    expect(err3).toBeInstanceOf(AIError);
    expect(err3).toMatchObject({
      code: "ai.invalid-response",
      message: "bad json",
    });

    expect(() => toAIError(new DOMException("Aborted", "AbortError"))).toThrow("Aborted");
  });

  it("wraps rejected async work into AI errors", async () => {
    await expect(wrapAIError(() => Promise.reject({ statusCode: 502 }))).rejects.toMatchObject({
      code: "ai.http.502",
    });
  });
});
