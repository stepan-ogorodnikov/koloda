import { isAppError } from "@koloda/app";

// WHY: AppError.message is the code; the human-readable text is `.details`.
export function displayErrorMessage(error: Error): string {
  if (isAppError(error) && error.details) return error.details;
  return error.message || error.name || "unknown";
}
