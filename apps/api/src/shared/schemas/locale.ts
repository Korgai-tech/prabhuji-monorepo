import { z } from "zod";

/**
 * THE public read-query locale param (`docs/CMS-LABEL-LOCALIZATION.md` §3).
 *
 * Every public read endpoint that localizes framing labels — or filters content
 * by language MEMBERSHIP — takes the same optional `locale` query param, from
 * this one definition. Before this existed the declaration was copy-pasted
 * across ~15 route schemas and two modules (mantras, status) had drifted to
 * calling it `language`, so `?locale=hi` was silently dropped and the caller got
 * base (English) labels with no error.
 *
 * ## Why a free string and not `LanguageCodeSchema`
 *
 * An unsupported code is a NO-MATCH that resolves to the base column, never a
 * `400`. Two reasons:
 *
 *   - The read path is already tolerant everywhere it matters —
 *     `resolveLocalizedLabel` falls back to the base column, the deity read
 *     resolves `requested → en → slug`, and paywall resolves `requested → hi →
 *     en`. A `400` adds nothing except a hard failure mode.
 *   - It is forward-compatible: an app build that ships a ninth language before
 *     the API accepts it degrades to base labels instead of erroring out of a
 *     whole screen.
 *
 * This is the posture `core/aarti` and `core/horoscope` already shipped; it is
 * now the rule rather than the exception. WRITE paths are the opposite — they
 * keep the strict `LanguageCodeSchema` enum, because an invalid code must never
 * reach the database.
 *
 * ## Why plain objects and not `.meta({ id })`
 *
 * `@fastify/swagger`'s emitter can't resolve named component refs for
 * querystring params (same reason `paginationQuery` and `PaywallConfigQuery` are
 * inlined), so modules merge these into their own query object via `.extend(…)`.
 */

/** The wire format: an ISO 639-1-ish code. Bounds only — never an enum. */
export const localeCode = z.string().min(2).max(10);

/**
 * `{ locale?: string }` — the common form. Compose with
 * `.extend(localeQuery.shape)`, e.g.
 * `paginationQuery.extend(localeQuery.shape)`.
 */
export const localeQuery = z.object({ locale: localeCode.optional() });

/**
 * `{ locale: string }` — for the two endpoints where the caller MUST name a
 * locale (`GET /deities`, `GET /paywall/config`): both echo a `localeServed`
 * back, so "no locale" has no meaningful answer.
 */
export const requiredLocaleQuery = z.object({ locale: localeCode });

export type LocaleQuery = z.infer<typeof localeQuery>;
