import type { FastifyInstance } from "fastify";
import type { EventBus } from "@api/shared/events";
import { initAartiModule } from "@api/core/aarti";
import { initAuthModule } from "@api/core/auth";
import { initBooksModule } from "@api/core/books";
import { initChatModule } from "@api/core/chat";
import { initDeityModule } from "@api/core/deity";
import { initDownloadsModule } from "@api/core/downloads";
import { initEngagementModule } from "@api/core/engagement";
import { initFirebaseTokensModule } from "@api/core/firebase-tokens";
import { initHomeModule } from "@api/core/home";
import { initHoroscopeModule } from "@api/core/horoscope";
import { initKuldevtaModule } from "@api/core/kuldevta";
import { initLanguagesModule } from "@api/core/languages";
import { initMantrasModule } from "@api/core/mantras";
import { initMediaModule } from "@api/core/media";
import { initModalsModule } from "@api/core/modals";
import { initNotificationsModule } from "@api/core/notifications";
import { initOtpModule } from "@api/core/otp";
import { initPaymentModule } from "@api/core/payment";
import { initPaywallModule } from "@api/core/paywall";
import { initPinnedContentModule } from "@api/core/pinned-content";
import { initReportsModule } from "@api/core/reports";
import { initRingtoneModule } from "@api/core/ringtone";
import { initStatusModule } from "@api/core/status";
import { initSubscriptionModule } from "@api/core/subscription";
import { initTestUsersModule } from "@api/core/test-users";
import { initUsersModule } from "@api/core/users";
import { initWallpaperModule } from "@api/core/wallpaper";

/**
 * THE module list. One place, three consumers (TAM-82):
 *   - `src/bootstrap.ts`          — the running app
 *   - `scripts/openapi-doc.ts`    — the emitted openapi.json
 *   - the admin-route guard contract test — the live route table
 *
 * Extracted because the third consumer makes drift a security bug, not just an
 * inconsistency: the guard test proves "every /admin/* route is guarded" by
 * enumerating the real route table, so a module missing from ITS list would be
 * a module whose admin routes are silently never checked. Now a new module is
 * registered once and all three see it. (bootstrap.ts and openapi-doc.ts had
 * already drifted — openapi-doc.ts omitted notifications.)
 *
 * Registration ORDER matters in exactly one place and it is preserved below:
 * subscription MUST init before otp (TAM-47).
 *
 * @param events - the domain-event bus. Optional: the OpenAPI emitter and the
 *   contract test build the app purely to read its route table and have no bus.
 *   When omitted, event-only modules (notifications) are skipped and producers
 *   simply don't publish — `AuthService.events` is already optional for the
 *   same reason.
 */
export function initAllModules(app: FastifyInstance, events?: EventBus): void {
  // Modules wire their OWN event usage — auth publishes, notifications consumes
  // (its own consumer group). This function doesn't know the events.
  initAuthModule(app, events);
  if (events) initNotificationsModule(events);
  // The supported-language catalogue (`GET /languages`, unauthenticated). No
  // deps at all — it serves a shared constant — so it goes first and the
  // onboarding language picker can fetch it before the user has a token.
  initLanguagesModule(app);
  // TAM-47: subscription MUST init before OTP — the OTP verify path looks up
  // the `subscription` facade via `performServiceCall` to seed the free-tier
  // row for new users, and `performServiceCall` throws SERVICE_UNAVAILABLE
  // if the facade isn't registered yet.
  initSubscriptionModule(app);
  initOtpModule(app);
  initTestUsersModule(app);
  initPaywallModule(app);
  // Payment resolves BOTH the `subscription` facade (every entitlement write)
  // and the `paywall` facade (plan pricing) via `performServiceCall`, so it
  // must init after both — same SERVICE_UNAVAILABLE hazard as the TAM-47 note
  // above.
  initPaymentModule(app);
  initUsersModule(app);
  // TAM-57: content-platform foundation. No cross-module deps — deity/
  // engagement facades are consumed by later module tickets (TAM-61…76).
  initDeityModule(app);
  initEngagementModule();
  // TAM-84: media. Publishes IMediaApi (presign / head / validateOwnedUrl) into
  // GlobalServiceMap and mounts POST /admin/media/presign. Registered before the
  // content modules so their admin write-services can resolve the `media` facade
  // via performServiceCall at request time (validateOwnedUrl on every media
  // column write). No cross-module runtime deps of its own.
  initMediaModule(app);
  // TAM-63: Aarti & Bhajans. Consumes the subscription/engagement/deity facades
  // at request time (registered above) via `performServiceCall`.
  initAartiModule(app);
  // TAM-65: Mantras & Stutis. Sibling of aarti — consumes the same
  // subscription/engagement/deity facades at request time via `performServiceCall`.
  initMantrasModule(app);
  // TAM-67: Ringtone. Browse-first Pro-conversion utility — consumes the same
  // subscription/engagement/deity facades at request time via `performServiceCall`.
  initRingtoneModule(app);
  // TAM-69: Wallpaper. CMS-driven discovery (home rows + listing + detail).
  // DISCOVERY IS FREE — no server entitlement gate; consumes the engagement +
  // deity facades at request time via `performServiceCall` (no subscription dep).
  initWallpaperModule(app);
  // TAM-71: Status Sharing. CMS-curated vertical status feed + per-user overlay
  // profile + fixed overlay template. EVERYTHING IS FREE — no server entitlement
  // gate (the Pro Share render is enforced CLIENT-SIDE, TAM-72); consumes the
  // engagement facade at request time via `performServiceCall` (no subscription
  // or deity runtime dep — deity tags are seed-validated slugs).
  initStatusModule(app);
  // TAM-73: Horoscope. Pro-only daily-value feature behind a `HoroscopeProvider`
  // interface (Phase-1 impl = CmsHoroscopeProvider, seeded rows — no external API
  // / LLM). DISCOVERY (zodiac grid) IS FREE; the daily RESULT is Pro-gated
  // server-side (fail-closed) via the `subscription` facade at request time.
  initHoroscopeModule(app);
  // TAM-75: Books & Scriptures. DISCOVERY IS FREE (home, listings, categories);
  // READING is Pro-gated server-side (fail-closed) via the `subscription` facade
  // at request time (contents, chapter, direct-scripture body + audio).
  initBooksModule(app);
  // TAM-61: Home. The primary discovery surface — CMS-driven hero banners + a
  // mixed, cursor-paginated feed + engagement WRITE forwarders. Consumes ONLY
  // the engagement facade at request time via `performServiceCall` (feed
  // enrichment + like/view/share). NO subscription dep: ranking + content are
  // identical for free and Pro users (PRD §5, §10) — Home is never Pro-gated.
  initHomeModule(app);
  // Firebase Cloud Messaging device-token registry. JWT-guarded upsert/delete
  // for the mobile app's `onTokenRefresh` + logout hooks. No cross-module deps.
  initFirebaseTokensModule(app);
  // TAM-N: Reports. `POST /reports` — file a report against a status or the
  // account it is attributed to. Resolves the `status` facade at REQUEST time
  // (`getReportTarget`) to validate the status and resolve `reported_user_id`
  // server-side, so it must init after `initStatusModule` above.
  initReportsModule(app);
  // Chat. RAGFlow-backed assistant (`POST /chat/messages`,
  // `GET /chat/sessions/:sessionId/messages`). No ordering constraint — it
  // resolves no other module's facade and registers none of its own.
  initChatModule(app);
  // TAM-125: Downloads. Pro-only manifest endpoint (`GET /content/:type/:id/download`).
  // MUST init AFTER media/aarti/mantras — it resolves those facades at REQUEST
  // time via `performServiceCall`, which throws SERVICE_UNAVAILABLE if the
  // callee is not yet registered (same hazard as the TAM-47 note above).
  initDownloadsModule(app);
  // TAM-165: Kuldevta Khoj. JWT-guarded `POST /kuldevta/identify` — parses the
  // family's six lineage answers via the RAGFlow agent, matches deterministically
  // against the 33-deity registry, and persists the assignment. No cross-module
  // runtime deps, so it may sit anywhere in this list; last keeps the ordering
  // constraints above readable as one block.
  initKuldevtaModule(app);
  // TAM-173: pinned-content CMS. Overlay pins on top of the /home/feed and
  // /status/*/feed rotations. MUST init AFTER `deity`, `home` and `status` —
  // the write service resolves all three facades via `performServiceCall` at
  // REQUEST time (deity slug + content_id validation), and `performServiceCall`
  // throws SERVICE_UNAVAILABLE if the callee is not yet registered (same hazard
  // as the TAM-47 note above).
  initPinnedContentModule(app);
  // TAM-174: generalized modals. No cross-module deps — it is armed by an
  // external webhook and read by the app.
  initModalsModule(app);
}
