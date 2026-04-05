import { describe, expect, it } from "vitest";
import { getAIHttpErrorMessageDescriptor, throwForAIResponse, toAIAppError, wrapAIError } from "./ai-error";
import { AppError } from "./error";

describe("ai-error", () => {
  it("resolves direct and fallback AI http message descriptors", () => {
    expect(getAIHttpErrorMessageDescriptor("ai.http.404")).toBe("ai.http.404");
    expect(getAIHttpErrorMessageDescriptor("ai.http.418")).toBe("ai.http 418");
    expect(getAIHttpErrorMessageDescriptor("db.get")).toBeNull();
  });

  it("throws an AppError for failed AI responses", () => {
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
      expect(error).toBeInstanceOf(AppError);
      expect(error).toMatchObject({
        code: "ai.http.429",
        details: "429 Too Many Requests",
      });
    }
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

  it("wraps rejected async work into AI app errors", async () => {
    await expect(wrapAIError(() => Promise.reject({ statusCode: 502 }))).rejects.toMatchObject({
      code: "ai.http.502",
    });
  });
});
