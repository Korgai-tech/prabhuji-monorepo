export { mediaUrl, type MediaUrl } from "./media.js";
export { hexColor, gradientStop, type HexColor } from "./color.js";
export {
  localeCode,
  localeQuery,
  requiredLocaleQuery,
  type LocaleQuery,
} from "./locale.js";
// Re-exported so anything locale-shaped has ONE import path (`@api/shared/schemas`).
// `shared/language.schema.ts` remains the definition — it is imported directly by
// ~20 write-path call sites and moving it would be churn for no gain.
export {
  SUPPORTED_LANGUAGES,
  LANGUAGE_CODES,
  DEFAULT_LANGUAGE_CODE,
  LanguageCodeSchema,
  type LanguageCode,
} from "../language.schema.js";
export {
  paginationQuery,
  pagedEnvelope,
  DEFAULT_PAGE_LIMIT,
  MAX_PAGE_LIMIT,
  type PaginationQuery,
} from "./pagination.js";
export {
  engagementContentType,
  ENGAGEMENT_CONTENT_TYPES,
  type EngagementContentType,
} from "./engagement.js";
export { UserRoleSchema, ADMIN_ROLE, type UserRole } from "./user-role.js";
export {
  LoginTypeSchema,
  OTP_LOGIN,
  EMAIL_LOGIN,
  type LoginType,
} from "./login-type.js";
export {
  adminPaginationQuery,
  adminPagedEnvelope,
  sortQuery,
  ADMIN_DEFAULT_PAGE_SIZE,
  ADMIN_MAX_PAGE_SIZE,
  type AdminPaginationQuery,
} from "./admin-pagination.js";
export {
  adminLocale,
  adminTranslationParams,
  translationInput,
  translationUpsertBody,
  translationPatchBody,
  translationView,
  type AdminTranslationParamsInput,
} from "./admin-translations.js";
export {
  SubscriptionStatusData,
  SubscriptionStatusEnum,
} from "./subscription-status.js";
