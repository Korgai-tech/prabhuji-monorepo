import { z } from "zod";
import { LanguageCodeSchema } from "@api/shared/language.schema";

/**
 * Zod schemas for `PATCH /users/me` + `GET /users/me`.
 *
 * These are the single source of truth for the OpenAPI contract emitted by
 * `pnpm nx run api:openapi` and consumed by the generated TS + Dart clients.
 */

/**
 * `name` validation:
 *   - `.trim()` normalizes leading/trailing whitespace (Zod v4: the trim
 *     coerces on parse, so the value the controller sees is already trimmed).
 *   - `.min(1)` rejects the empty string AFTER trimming — a whitespace-only
 *     input becomes "" and fails validation with 400.
 *   - `.max(64)` matches the spec's UI cap.
 */
export const NameSchema = z.string().trim().min(1).max(64);

/**
 * Request body for `PATCH /users/me`.
 *
 * `.strict()` — Fastify + fastify-type-provider-zod rejects unknown keys with
 * 400. This is the security backstop that prevents a client from injecting
 * `onboardingCompletedAt` (or any other server-owned column) via the body.
 *
 * `.refine(atLeastOne)` — a PATCH with an empty body is a no-op and rejected
 * to avoid ambiguous "update nothing" writes.
 */
export const UpdateMeRequest = z
  .object({
    name: NameSchema.optional(),
    selectedLanguage: LanguageCodeSchema.optional(),
  })
  .strict()
  .refine(
    (v) => v.name !== undefined || v.selectedLanguage !== undefined,
    { message: "At least one of 'name' or 'selectedLanguage' is required" }
  )
  .meta({ id: "UpdateMeRequest" });

/**
 * The public projection of a user — the ONLY user shape emitted over HTTP.
 *
 * Explicitly excludes `email` and `passwordHash`. Any field added to the Prisma
 * `User` model must be considered for inclusion here on a case-by-case basis —
 * the default is "keep it internal".
 *
 * `phoneNumber` IS included, deliberately. It is the app's only identity fact
 * about its own user (there is no email on a phone account), and the app needs
 * to show which number payment notifications will reach. It ships in the Dart
 * models inside the APK, which is the accepted cost of that.
 *
 * `.meta({ id: "UsersPublicUser" })` — surfaces as a reusable OpenAPI
 * component used by the generated clients. Prefixed to avoid collision with
 * auth's minimal `PublicUser` (id+email only) — that one is the classic
 * email-login projection, this one is the full onboarding-aware projection.
 */
export const PublicUserSchema = z
  .object({
    id: z.string(),
    name: z.string().nullable(),
    selectedLanguage: LanguageCodeSchema.nullable(),
    // ISO-8601 datetime string on the wire. Service converts the Prisma
    // `Date` to `.toISOString()` before returning so the serializer's
    // string check passes.
    onboardingCompletedAt: z.string().datetime().nullable(),
    phoneCountryCode: z.string().nullable(),
    phoneNumber: z.string().nullable(),
  })
  .meta({ id: "UsersPublicUser" });

/**
 * Whether this user has the chatbot, and which RAGFlow agent answers them.
 *
 * Published here so the app can HIDE the chat entry point rather than render a
 * button that 403s. Resolved from the user's A/B variant on every read — it is
 * not stored on the user row, so an experiment change takes effect on the next
 * profile fetch with nothing to backfill.
 *
 * `agentId` is null exactly when `enabled` is false; the two are read from one
 * map and cannot disagree.
 */
export const ChatConfigSchema = z
  .object({
    enabled: z.boolean(),
    agentId: z.string().nullable(),
    /**
     * The A/B variant name this user was assigned to — the opaque bucket label
     * mobile analytics groups events by. Same string the bucket map / A/B
     * console publishes (`kuldevta_chat`, `bhagwat_gita_chat`, `content_chat`,
     * …). Null when the user has no assignment (control, no id to bucket on,
     * or an unreachable A/B service).
     *
     * SNAKE_CASE ON PURPOSE, matching the two `kuldeveta` siblings — the
     * mobile client is already coded against `chat_type` on the wire (it
     * accepts `chatType` as a fallback, but the primary key is the snake_case
     * one, so the two snake_case siblings and this one are read consistently).
     * Do NOT "fix" it to `chatType`.
     */
    chat_type: z.string().nullable(),
    /**
     * Whether this user has completed kuldevta-khoj — so the launch payload can
     * choose between "Talk to your kuldevta" and "Find your kuldevta".
     *
     * Only meaningful when `agentId` is the kuldevta agent. Outside that arm it
     * is always `false`, meaning "not applicable" rather than "no kuldevta":
     * the lookup is skipped so every app launch does not pay for a query most
     * users cannot act on.
     */
    kuldevtaAssigned: z.boolean(),
    /**
     * Whether the granted agent IS the kuldevta persona agent — whether to
     * show the kuldevta chat entry point at all.
     *
     * Derivable from `agentId`, but only by a client that hardcodes the
     * agent's hex id. That id is provider state and has already changed twice
     * when the agent was republished; a shipped app cannot be corrected when
     * it changes again. So the arm is published as a boolean and stays a
     * server decision.
     *
     * Read this FIRST: it is what makes `kuldevtaAssigned` meaningful.
     * `false` here means "not in the kuldevta arm", and `kuldevtaAssigned`
     * carries no information in that case.
     *
     * SNAKE_CASE, and spelled "kuldeveta", ON PURPOSE. DO NOT "FIX" IT — the
     * mobile app is already coded against this exact key, so renaming it to
     * `showKuldevtaChat` would silently hide the kuldevta chat entry point on
     * every shipped build until the app is updated and re-released.
     *
     * It is the only such key in this API; everything else on the wire,
     * including its sibling `kuldevtaAssigned`, is camelCase over the
     * "kuldevta" spelling used by the routes and the tables. The service keeps
     * the idiomatic `showKuldevtaChat` internally and the controller renames it
     * here, so the oddity stops at the boundary instead of spreading through
     * the module.
     */
    show_kuldeveta_chat: z.boolean(),
    /**
     * The deity's name for the chat header — the ROMAN spelling ("Khandoba"),
     * which is the name the persona agent is given as its own and therefore
     * the name it calls itself by in its replies. `GET /kuldevta/identify`
     * publishes the Devanagari one alongside it for the result screen.
     *
     * `null` means there is no name to show, and covers BOTH "not in the
     * kuldevta arm" and "in the arm, kuldevta-khoj not answered yet".
     * `show_kuldeveta_chat` and `kuldevtaAssigned` already separate those two;
     * a third field repeating the distinction would only be a way for them to
     * disagree.
     *
     * SNAKE_CASE and spelled "kuldeveta" for the same reason as the key above,
     * and by the same request — the two are read together by the same screen,
     * so they match each other rather than the rest of the payload.
     */
    kuldeveta_name: z.string().nullable(),
    /**
     * Whether the app should Pro-gate chat for this user. Mirrors the
     * `CHAT_REQUIRES_PRO` switch in `chat.constants.ts` — that constant's
     * docblock is the explanation; this is only its wire form.
     *
     * CAMELCASE, unlike its three snake_case siblings above. Those are
     * snake_case because shipped builds are already coded against those exact
     * keys and renaming them would break live apps; this key is new, so it
     * follows the API's actual convention instead of inheriting a quirk it
     * has no reason to carry.
     *
     * A client that does not find this key must read it as `false` (ungated),
     * which is what makes the field safe to add: builds that predate it are
     * unaffected, and builds that postdate it obey the flip on the next
     * launch with no release.
     *
     * NOT a permission. The server does not check entitlement on
     * `POST /chat/messages` and this field does not change that — see the note
     * on `ChatConfig.requiresPro`.
     */
    requiresPro: z.boolean(),
  })
  .meta({ id: "UsersChatConfig" });

/**
 * TAM-258 — where the app should land this user on open, as a deep link.
 *
 * Resolved entirely server-side: the client holds no bucket, reads no UTM and
 * keeps no one-shot state, which is what lets the codes, the bucket ranges, the
 * arms AND the destinations themselves change without an app release.
 *
 * Every field is a plain string rather than a `z.enum`, deliberately. The
 * generated Dart model is the reason: an enum would make a value this build
 * predates a DECODE FAILURE on a client that should simply have fallen back to
 * Home. Same trade `selectedLanguage` makes on the mobile side, and the app is
 * specified to treat any module it does not recognise as Home.
 */
export const LandingSchema = z
  .object({
    /**
     * WHERE to open, as an app deep link (`prabhuji://status`,
     * `prabhuji://ringtone/<id>`), or `""` for the default Home landing.
     *
     * The routing instruction — `module` below is only its label. A deep link
     * rather than a destination name so a new landing page is a server change:
     * the app already parses this scheme and already puts Home underneath an
     * externally-arriving navigation. A slug this build does not know lands on
     * Home, so the client may refuse it; it is a hint, not an order.
     *
     * Always the app's own `prabhuji://` scheme — validated server-side, because
     * this string can be authored in the A/B console and arrives on the client
     * as something to navigate to.
     */
    deeplink: z.string(),
    /**
     * The analytics label — the deep link's slug (`status`, `ringtone`,
     * `wallpaper`, …) or `home`. Derived from `deeplink`, never independent of
     * it, and deliberately open-ended.
     */
    module: z.string(),
    /**
     * Why: `utm_matched` | `utm_missing` | `utm_unmatched` | `bucket_assigned`
     * | `not_in_experiment`. Analytics only — the client forwards it verbatim
     * and never branches on it.
     */
    source: z.string(),
    /**
     * The code read from the user's first ad group, or `""`. Forwarded to
     * analytics verbatim and never matched against a client-side list, so
     * renaming a code stays a server change.
     */
    utmCode: z.string(),
  })
  .meta({ id: "UsersLanding" });

/**
 * `GET /users/me` — the profile the app boots on, so it carries `chatConfig`
 * and `landing` alongside the user.
 */
export const MeResponse = z
  .object({
    user: PublicUserSchema,
    chatConfig: ChatConfigSchema,
    landing: LandingSchema,
  })
  .meta({ id: "UsersMeResponse" });

/**
 * `PATCH /users/me` — the updated user, and NOTHING else.
 *
 * Deliberately not `MeResponse`: `chatConfig` is resolved from an A/B service
 * over the network, and a write has no business paying for that call or
 * re-reporting a value a name change cannot have altered. The two shapes were
 * briefly shared, which made every PATCH a 500 — the handler returns only the
 * user, so the response failed serialization against a schema demanding a field
 * it never sends.
 */
export const UpdateMeResponse = z
  .object({
    user: PublicUserSchema,
  })
  .meta({ id: "UsersUpdateMeResponse" });

export function envelope<T extends z.ZodTypeAny>(data: T) {
  return z.object({
    success: z.literal(true),
    message: z.string(),
    data,
  });
}

export const ErrorEnvelope = z
  .object({
    success: z.literal(false),
    message: z.string(),
    data: z.null(),
    errorCode: z.string().optional(),
  })
  .meta({ id: "UsersErrorEnvelope" });
