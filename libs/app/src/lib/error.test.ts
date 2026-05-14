import { describe, expect, it } from "vitest";
import { ZodError } from "zod";
import { z } from "zod";
import { AppError, isAbortError, isAppError, throwKnownError, toFormErrors } from "./error";

describe("AppError", () => {
  it("sets name to AppError", () => {
    const err = new AppError("unknown");
    expect(err.name).toBe("AppError");
  });

  it("sets message from code", () => {
    const err = new AppError("db.get");
    expect(err.message).toBe("db.get");
  });

  it("stores code and optional details", () => {
    const err = new AppError("ai.http.500", "Something went wrong");
    expect(err.code).toBe("ai.http.500");
    expect(err.details).toBe("Something went wrong");
  });

  it("details are undefined when not provided", () => {
    const err = new AppError("unknown");
    expect(err.details).toBeUndefined();
  });

  it("is instance of Error", () => {
    const err = new AppError("unknown");
    expect(err).toBeInstanceOf(Error);
  });

  it("is instance of AppError", () => {
    const err = new AppError("unknown");
    expect(err).toBeInstanceOf(AppError);
  });
});

describe("isAppError", () => {
  it("returns true for AppError instances", () => {
    expect(isAppError(new AppError("unknown"))).toBe(true);
  });

  it("returns false for plain Error", () => {
    expect(isAppError(new Error("fail"))).toBe(false);
  });

  it("returns false for plain objects", () => {
    expect(isAppError({ code: "unknown" })).toBe(false);
  });

  it("returns false for null", () => {
    expect(isAppError(null)).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(isAppError(undefined)).toBe(false);
  });
});

describe("isAbortError", () => {
  it("returns true for DOMException with name AbortError", () => {
    expect(isAbortError(new DOMException("Aborted", "AbortError"))).toBe(true);
  });

  it("returns false for DOMException with different name", () => {
    expect(isAbortError(new DOMException("Failed", "NetworkError"))).toBe(false);
  });

  it("returns false for plain Error", () => {
    expect(isAbortError(new Error("Aborted"))).toBe(false);
  });
});

describe("throwKnownError", () => {
  it("returns the result of a successful function", async () => {
    const result = await throwKnownError("db.get", async () => 42);
    expect(result).toBe(42);
  });

  it("rethrows ZodError unchanged", async () => {
    const zodError = new ZodError([]);
    await expect(
      throwKnownError("db.add", async () => { throw zodError; }),
    ).rejects.toBe(zodError);
  });

  it("wraps a plain Error in AppError with the given code", async () => {
    await expect(
      throwKnownError("db.get", async () => { throw new Error("DB down"); }),
    ).rejects.toMatchObject({
      name: "AppError",
      code: "db.get",
      details: "DB down",
    });
  });

  it("wraps non-Error thrown values with undefined details", async () => {
    await expect(
      throwKnownError("db.update", async () => { throw "something else"; }),
    ).rejects.toMatchObject({
      name: "AppError",
      code: "db.update",
      details: undefined,
    });
  });

  it("wraps an existing AppError (losing original code)", async () => {
    await expect(
      throwKnownError("db.get", async () => { throw new AppError("ai.http"); }),
    ).rejects.toMatchObject({
      name: "AppError",
      code: "db.get",
      details: "ai.http",
    });
  });
});

describe("toFormErrors", () => {
  it("converts a ZodError with one issue to indexed record", () => {
    const schema = z.object({ name: z.string().min(1) });
    const result = schema.safeParse({ name: "" });
    if (!result.success) {
      const errors = toFormErrors(result.error);
      expect(errors["0"]).toHaveLength(1);
      expect(errors["0"][0].path).toEqual(["name"]);
      expect(errors["0"][0].message).toBe("Too small: expected string to have >=1 characters");
    }
  });

  it("converts a ZodError with multiple issues to indexed keys", () => {
    const schema = z.object({ a: z.string().min(1), b: z.string().min(1) });
    const result = schema.safeParse({ a: "", b: "" });
    if (!result.success) {
      const errors = toFormErrors(result.error);
      expect(errors["0"]).toHaveLength(1);
      expect(errors["1"]).toHaveLength(1);
    }
  });

  it("converts AppError to a single entry with error code", () => {
    const err = new AppError("db.get", "details");
    const errors = toFormErrors(err);

    expect(errors["0"]).toHaveLength(1);
    expect(errors["0"][0].message).toBe("db.get");
    expect(errors["0"][0].path).toEqual(["0"]);
  });

  it("converts plain Error to unknown fallback", () => {
    const err = new Error("something happened");
    const errors = toFormErrors(err);

    expect(errors["0"]).toHaveLength(1);
    expect(errors["0"][0].message).toBe("unknown");
    expect(errors["0"][0].path).toEqual(["0"]);
  });

  it("converts null to unknown fallback", () => {
    const errors = toFormErrors(null);

    expect(errors["0"]).toHaveLength(1);
    expect(errors["0"][0].message).toBe("unknown");
  });
});
