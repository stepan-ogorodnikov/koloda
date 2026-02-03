/**
 * Handles database errors by logging them and rethrowing
 * @param error - The error object to handle
 */
export function handleDBError(error: unknown) {
  console.error(error);
  throw error;
}

export type Timestamps = {
  createdAt: Date;
  updatedAt: Date | null;
};
