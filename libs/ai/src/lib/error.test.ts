import { describe, expect, it } from "vitest";
import {
  AIError,
  getAIHttpErrorCode,
  getErrorDetails,
  isAIError,
  throwForAIResponse,
  toAIError,
  wrapAIError,
} from "./error";

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

  it("throws an AIError for failed AI responses including body text", async () => {
    const response = new Response("ok", { status: 200 });
    expect(await throwForAIResponse(response)).toBe(response);

    await expect(
      throwForAIResponse(
        new Response('{"error":{"message":"nope"}}', {
          status: 429,
          statusText: "Too Many Requests",
        }),
      ),
    ).rejects.toMatchObject({
      code: "ai.http.429",
      message: '429 Too Many Requests — {"error":{"message":"nope"}}',
    });
  });

  it("maps structured, network, and invalid-response errors", () => {
    const err1 = toAIError({ status: 503, responseBody: "gateway timeout" });
    expect(err1).toBeInstanceOf(AIError);
    expect(err1).toMatchObject({
      code: "ai.http.503",
      message: "503 — gateway timeout",
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

  it("prefers APICallError responseBody over bare statusText like Forbidden", () => {
    const apiError = Object.assign(new Error("Forbidden"), {
      statusCode: 403,
      url: "https://openrouter.ai/api/v1/chat/completions",
      responseBody: '{"error":{"message":"Key limit exceeded","code":403}}',
    });

    expect(getErrorDetails(apiError)).toBe(
      '403 Forbidden — {"error":{"message":"Key limit exceeded","code":403}} — url=https://openrouter.ai/api/v1/chat/completions',
    );
    expect(toAIError(apiError)).toMatchObject({
      code: "ai.http.403",
      message:
        '403 Forbidden — {"error":{"message":"Key limit exceeded","code":403}} — url=https://openrouter.ai/api/v1/chat/completions',
    });
  });

  it("wraps rejected async work into AI errors", async () => {
    await expect(wrapAIError(() => Promise.reject({ statusCode: 502 }))).rejects.toMatchObject({
      code: "ai.http.502",
    });
  });
});
