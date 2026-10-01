import { z } from "zod";
import { adminPaginationQuery } from "@api/shared/schemas";
import { CHAT_CONTENT_TYPES, CHAT_ROLES } from "@api/core/chat/types";

/**
 * Zod schemas for the `/admin/chat/*` surface — the CMS chat-transcript viewer.
 *
 * #EXPORT_CRITICAL: every schema in this file is reachable ONLY from routes
 * registered through `registerAdminRoute`, which stamps the `admin` OpenAPI tag.
 * TAM-85 builds `openapi.public.json` by dropping tagged operations, so none of
 * this reaches the mobile Dart codegen. That matters here more than on most
 * admin surfaces: `AdminChatUser` carries a plaintext phone number, and
 * `AdminChatTranscriptMessage` carries what a named user typed to the bot.
 */

/**
 * A session page is deliberately SMALLER than the admin default.
 *
 * Each row on this page carries a whole conversation, not a table row: the
 * server does one indexed tail query per session, and the browser renders every
 * bubble. `adminPaginationQuery`'s 100 would mean 100 subqueries and a DOM of
 * tens of thousands of nodes for a heavy user. Ten reads as roughly "a screen
 * of conversations", which is what this page is for.
 */
export const ADMIN_CHAT_SESSION_PAGE_DEFAULT = 10;
export const ADMIN_CHAT_SESSION_PAGE_MAX = 25;

/**
 * `?userId=…&page=…&pageSize=…`.
 *
 * `userId` is REQUIRED and a uuid. This endpoint has no "all users" mode on
 * purpose — a global firehose of everything every user has ever said to the bot
 * is a different, much larger disclosure than "show me this one user's
 * transcript", and nothing in the CMS asks for it.
 */
export const AdminChatTranscriptQuery = adminPaginationQuery.extend({
  userId: z.string().uuid(),
  pageSize: z.coerce
    .number()
    .int()
    .positive()
    .max(ADMIN_CHAT_SESSION_PAGE_MAX)
    .default(ADMIN_CHAT_SESSION_PAGE_DEFAULT),
});
export type AdminChatTranscriptQueryInput = z.infer<typeof AdminChatTranscriptQuery>;

/**
 * Who the transcript belongs to, so the page can put a name on the header
 * instead of echoing back the uuid that was pasted into it.
 *
 * Also what makes "no such user" (404) distinguishable from "this user has
 * never chatted" (200, zero sessions) — on a debugging tool keyed by a
 * hand-pasted id, a typo and a quiet user must not look identical.
 *
 * `phoneNumber` is plaintext PII. It is here for the same reason and under the
 * same containment as on `AdminUserListItem`: the guard pair plus the `admin`
 * tag. It must not be logged.
 */
export const AdminChatUser = z
  .object({
    id: z.string().uuid(),
    name: z.string().nullable(),
    phoneCountryCode: z.string().nullable(),
    phoneNumber: z.string().nullable(),
  })
  .meta({ id: "AdminChatUser" });

/**
 * One thing the agent recommended on a turn.
 *
 * `tag` is the agent's own id (`art_0011`) and is ALWAYS present; `type` and
 * `title` are null when it could not be placed against our catalogue — an
 * unmapped tag, or a row since deactivated. Reported rather than dropped: a
 * card that rendered empty in the app is exactly what an editor opens this
 * page to explain, and hiding the tag makes that indistinguishable from a turn
 * that recommended nothing.
 *
 * Deliberately carries NO `playUrl` and no Pro gating — see
 * `TranscriptMessage.recommendations`.
 */
const AdminChatRecommendation = z
  .object({
    tag: z.string(),
    type: z.enum(CHAT_CONTENT_TYPES).nullable(),
    title: z.string().nullable(),
  })
  .meta({ id: "AdminChatRecommendation" });

/** One turn, as the transcript renders it. */
export const AdminChatTranscriptMessage = z
  .object({
    id: z.string().uuid(),
    role: z.enum(CHAT_ROLES),
    /**
     * The text the USER ACTUALLY SAW — a bot row's stored `content` is the
     * agent's JSON envelope, unwrapped here by the same `parseAnswer` the
     * mobile history goes through. Rendering the raw column instead would show
     * an editor a blob of JSON for the content agent and prose for the other
     * two, i.e. a transcript that does not match the screen it is supposed to
     * reproduce.
     */
    message: z.string(),
    /**
     * The agent's self-reported confidence, when its envelope carried one.
     * Null on every user turn and on both prose agents — "not reported", not
     * "zero".
     */
    confidence: z.string().nullable(),
    /** Empty on every user turn and on the two prose agents. */
    recommendations: z.array(AdminChatRecommendation),
    createdAt: z.string().datetime(),
  })
  .meta({ id: "AdminChatTranscriptMessage" });

/** One conversation: the session header plus its turns, OLDEST FIRST. */
export const AdminChatSession = z
  .object({
    id: z.string().uuid(),
    /** The provider agent this conversation was actually opened against. */
    agentId: z.string(),
    /**
     * The A/B arm that agent serves, derived from `VARIANT_AGENTS`. Null when
     * no live variant maps to the stored agent — a retired arm. The CMS shows
     * that as unknown rather than as control, because they are different facts.
     */
    variant: z.string().nullable(),
    /** The deity the persona agent was opened as; null on every other agent. */
    personaSlug: z.string().nullable(),
    createdAt: z.string().datetime(),
    /** Every message stored for this session, including any beyond the cap. */
    messageCount: z.number().int().nonnegative(),
    /** True when `messages` is only the tail — see `ADMIN_CHAT_MESSAGE_CAP`
     *  in `services/chat.admin.service.ts`, which owns the cap. */
    truncated: z.boolean(),
    /** Chronological, so the page renders them top-to-bottom as written. */
    messages: z.array(AdminChatTranscriptMessage),
  })
  .meta({ id: "AdminChatSession" });

/**
 * `{ user, items, total, page, pageSize }`.
 *
 * The page half is `adminPagedEnvelope`'s shape verbatim (ADR §C2) so the CMS
 * pager works exactly as it does everywhere else; `user` rides alongside rather
 * than in a second request, because a transcript with no one's name on it is a
 * wall of text an editor cannot attribute. `items` is NEWEST SESSION FIRST —
 * the CMS reverses it to render newest at the bottom.
 */
export const AdminChatTranscriptResponse = z.object({
  success: z.literal(true),
  message: z.string(),
  data: z.object({
    user: AdminChatUser,
    items: z.array(AdminChatSession),
    total: z.number().int().nonnegative(),
    page: z.number().int().positive(),
    pageSize: z.number().int().positive(),
  }),
});

/** Per-module clone, so the OpenAPI emitter gets a distinct component id. */
export const ErrorEnvelope = z
  .object({
    success: z.literal(false),
    message: z.string(),
    data: z.null(),
    errorCode: z.string().optional(),
  })
  .meta({ id: "ChatAdminErrorEnvelope" });
