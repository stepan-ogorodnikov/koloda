/**
 * Persistence schema version for conversation rows.
 *
 * WHY: Restore refuses a row stamped with a newer version instead of loading
 * it into live state. There are no migrations: a row in any shape other than
 * the one this build writes is corrupt.
 */
export const CONVERSATION_SCHEMA_VERSION = 1;
