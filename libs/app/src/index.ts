export {
  clearActiveConversationId,
  conversationHasTurns,
  conversationListItemSchema,
  conversationRowSchema,
  getActiveConversationId,
  setActiveConversationId,
  toConversationListItem,
} from "./lib/conversations";
export type {
  Conversation,
  ConversationListItem,
  DeleteConversationData,
  SetConversationData,
} from "./lib/conversations";
export { timestampsValidation } from "./lib/db";
export type { Timestamps } from "./lib/db";
export { getAppPlatform } from "./lib/environment";
export {
  AppError,
  ERROR_MESSAGES,
  formatAppError,
  isAbortError,
  isAppError,
  throwKnownError,
  toFormErrors,
} from "./lib/error";
export type { ErrorCode, FormError, ZodIssue } from "./lib/error";
export { formatGenerateError, toAIAppError } from "./lib/error-ai";
export {
  DEFAULT_HOTKEYS_SETTINGS,
  HOTKEYS_LABELS,
  HOTKEY_SCOPE_LABELS,
  hotkeysSettingsValidation,
} from "./lib/settings-hotkeys";
export type { AppHotkeys, HotkeyEntry, HotkeyScope, HotkeysSettings } from "./lib/settings-hotkeys";
export {
  DARK_THEMES,
  DEFAULT_INTERFACE_SETTINGS,
  LANGUAGES,
  LIGHT_THEMES,
  LOCALES,
  MOTION_SETTINGS,
  SCHEMES,
  getLanguageCode,
  interfaceSettingsValidation,
} from "./lib/settings-interface";
export type { InterfaceSettings } from "./lib/settings-interface";
export {
  DEFAULT_LEARNING_SETTINGS,
  LEARNING_DAILY_LIMIT_TYPES,
  learningSettingsValidation,
  parseDayStartsAt,
  resolvedLearningSettingsValidation,
} from "./lib/settings-learning";
export type { LearningSettings, ResolvedLearningSettings } from "./lib/settings-learning";
export {
  deepMerge,
  generateUUID,
  getNextNumericId,
  mapObjectProperties,
  mapObjectPropertiesReverse,
  objectEntries,
} from "./lib/utility";
export type { DeepPartial, Modify, ObjectPropertiesMapping, UpdateData } from "./lib/utility";
