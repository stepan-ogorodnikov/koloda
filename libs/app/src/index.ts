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
  getAIHttpErrorMessageDescriptor,
  isAbortError,
  isAppError,
  throwKnownError,
  toFormErrors,
} from "./lib/error";
export type { ErrorCode, FormError, ZodIssue } from "./lib/error";
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
  SEED_ALGORITHM_COMPLEX_ID,
  SEED_ALGORITHM_SIMPLE_ID,
  SEED_TEMPLATE_REVEAL_BACK_FIELD_ID,
  SEED_TEMPLATE_REVEAL_FRONT_FIELD_ID,
  SEED_TEMPLATE_REVEAL_ID,
  SEED_TEMPLATE_TYPE_BACK_FIELD_ID,
  SEED_TEMPLATE_TYPE_FRONT_FIELD_ID,
  SEED_TEMPLATE_TYPE_ID,
} from "./lib/seed-ids";
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
  generateUuidv7,
  getNextNumericId,
  mintedUuidv7,
  mapObjectProperties,
  mapObjectPropertiesReverse,
  objectEntries,
} from "./lib/utility";
export type { DeepPartial, Modify, ObjectPropertiesMapping, UpdateData } from "./lib/utility";
