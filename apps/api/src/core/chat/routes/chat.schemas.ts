import { z } from "zod";
import { CHAT_CONTENT_TYPES, CHAT_ROLES } from "@api/core/chat/types";

/**
 * Zod schemas for the Chat module — the single source of truth for the OpenAPI
 * contract emitted by `pnpm nx run api:openapi` and the generated TS + Dart
 * clients.
 *
 * #EXPORT_CRITICAL:
 *   - `content` is the agent's answer VERBATIM. This agent currently replies
 *     with a JSON document plus a trailer line; that is the agent's prompt
 *     format, not our contract, so it stays an opaque string. If a client needs
 *     structured fields, they get modelled here explicitly — never inferred.
 *   - `agentId` is REQUIRED on the request and must equal the one this caller's
 *     A/B variant grants (from `GET /users/me`). It is a confirmation, not a
 *     selector: a mismatch is 400, never a way to reach another agent. A user
 *     whose variant grants no agent has chat disabled entirely (403
 *     `CHAT_DISABLED`), published up front as `chatConfig.enabled`.
 *   - `agentId` is a provider hex id, NOT a uuid. Do not tighten it to
 *     `.uuid()`.
 *   - The provider's raw envelope NEVER reaches the wire. It is archived in
 *     `chat_messages.raw_response` for debugging; the client gets `message`,
 *     `confidence` and resolved `content`.
 */

/** One recommended item. */
export const ContentItem = z
  .object({
    /**
     * NOT `.uuid()`. Five of the six content types key on a primary key, but
     * `horoscope` keys on the stable zodiac slug ("aries") — `zodiac_sign`
     * rows are seeded with generated uuids that differ per environment, so the
     * agent's id map cannot name them, and the slug is also what
     * `GET /horoscope/zodiac-signs` publishes for the grid the client matches
     * against.
     *
     * This was `.uuid()`, and the moment horoscope started resolving for real
     * every rashifal turn 500ed in RESPONSE serialization — the handler had
     * already succeeded, so the failure surfaced as an opaque
     * `FST_ERR_RESPONSE_SERIALIZATION` with no clue that a content id was to
     * blame. An opaque id is the honest type here: the client matches it, it
     * never parses it.
     */
    id: z.string().min(1),
    /** CMS-authored display title — what the card actually shows to the user. */
    title: z.string(),
    /**
     * Null for a free caller on Pro-only audio, and for a row with no playable
     * asset. The icon is served either way — a recommendation you cannot see is
     * worse than one you cannot play.
     */
    playUrl: z.string().nullable(),
    icon: z.string(),
  })
  .meta({ id: "ChatContentItem" });

/**
 * Recommendations grouped by kind. EVERY key is always present (empty when
 * nothing of that kind was recommended) so the client never branches on a
 * missing field.
 */
export const ContentGroups = z
  .object(
    Object.fromEntries(
      CHAT_CONTENT_TYPES.map((type) => [type, z.array(ContentItem)])
    ) as Record<(typeof CHAT_CONTENT_TYPES)[number], z.ZodArray<typeof ContentItem>>
  )
  .meta({ id: "ChatContentGroups" });

/** One turn as the client reads it — the provider's envelope already unwrapped. */
export const ChatMessage = z
  .object({
    /** OUR row id, not the provider's message id. */
    id: z.string().uuid(),
    sessionId: z.string().uuid(),
    role: z.enum(CHAT_ROLES),
    /** The agent's `reply_text`, or the user's own text. */
    message: z.string(),
    /** The agent's self-reported confidence. Null on a user turn. */
    confidence: z.string().nullable(),
    content: ContentGroups,
    /**
     * ANALYTICS PASS-THROUGH (the five fields below).
     *
     * The content agent replies with a JSON envelope carrying `intent_type`,
     * `recommended_deity`, `jaap_count` and `decline_category` alongside the
     * reply; we parsed three keys and discarded those four, which is why the
     * client's events for them arrived empty. They are the AGENT's vocabulary,
     * so they stay open strings — a new intent is a new value to count, never a
     * 400. Do not tighten these to enums.
     *
     * The other two live agents reply in prose, so every field here is null for
     * them. Null means "this agent does not report it", not "nothing happened".
     *
     * OPTIONAL ON THE WIRE, always sent by the server. Marking them required
     * would make the generated Dart constructor demand them at every call
     * site, so adding an analytics field would force edits to hand-written
     * client code that has no interest in it — a contract addition must not
     * cost the client a compile error.
     */
    matchedTags: z.array(z.string()).optional(),
    intentType: z.string().nullable().optional(),
    recommendedDeity: z.string().nullable().optional(),
    jaapCount: z.number().nullable().optional(),
    declineCategory: z.string().nullable().optional(),
    /**
     * True on the bot turn that was answered with the crisis card. Health-
     * adjacent — see the note on `ChatMessage.distressDetected` in types.ts
     * before putting this anywhere near message text.
     */
    distressDetected: z.boolean().optional(),
    /** OUR timestamp, ISO-8601 UTC. */
    createdAt: z.string().datetime(),
  })
  .meta({ id: "ChatMessage" });

/** Body of `POST /chat/messages`. */
export const SendMessageBody = z
  .object({
    message: z.string().min(1).max(4000),
    /**
     * The agent from `GET /users/me` -> `chatConfig.agentId`. REQUIRED, and
     * checked against the caller's own A/B grant — it confirms which agent the
     * client believes it is talking to, and is never used to select one.
     */
    agentId: z.string().min(1).max(64),
    /** Continue an existing conversation. Omit to start a new one. */
    sessionId: z.string().uuid().optional(),
  })
  .meta({ id: "SendMessageBody" });
export type SendMessageBodyInput = z.infer<typeof SendMessageBody>;

export const SendMessageResponse = z
  .object({
    success: z.literal(true),
    message: z.string(),
    data: z
      .object({
        sessionId: z.string().uuid(),
        agentId: z.string(),
        userMessage: ChatMessage,
        botMessage: ChatMessage,
      })
      .meta({ id: "SendMessageResult" }),
  })
  .meta({ id: "SendMessageResponse" });

export const ChatHistoryQuery = z.object({
  /**
   * Omit for "my most recent conversation" — what the chat screen does on open,
   * when it has no session id to name yet.
   */
  sessionId: z.string().uuid().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().positive().max(100).default(30),
});
export type ChatHistoryQueryInput = z.infer<typeof ChatHistoryQuery>;

/** One tappable suggestion on an empty chat screen. */
export const RecommendedMessage = z
  .object({
    /** Stable across rewording and translation, so taps stay countable. */
    id: z.string(),
    order: z.number().int().nonnegative(),
    text: z.string(),
    /** The class of intent behind the chip — see `RecommendedMessage`. */
    category: z.enum(["mood", "content", "horoscope", "scripture"]).optional(),
  })
  .meta({ id: "ChatRecommendedMessage" });

/**
 * The short intro clip the chat screen plays above the first message (TAM-177 /
 * TAM-178).
 *
 * SERVER-DRIVEN, and nullable ON PURPOSE. Only one of the three live agents has
 * an asset today, so `null` is a first-class SHIPPING state rather than a
 * degradation: the screen renders its caption and chips with no video card and
 * no gap. Two of three agents rely on that path right now, and delivering their
 * clip later is a bucket upload plus one constants line — no app release, which
 * is exactly why this lives here and not in the app's bundled config.
 */
export const ChatIntroVideo = z
  .object({
    /**
     * The analytics `video_id` — STABLE ACROSS RE-ENCODES, unlike the URL. The
     * client stamps it on `chat_video_started` / `chat_video_paused`, so
     * swapping the file for a smaller encode under the same key must not split
     * the funnel in the warehouse.
     */
    videoId: z.string(),
    /**
     * Absolute, resolved at serve time from `MEDIA_PUBLIC_BASE_URL` + a
     * relative media key. The host is NEVER stored alongside the key — see
     * `introVideoForAgent` in `chat.constants.ts`.
     */
    url: z.string().url(),
    /**
     * The clip's REAL length, in milliseconds.
     *
     * This drives a duration badge the client paints BEFORE the first frame
     * arrives (that is the whole point of sourcing it from the server rather
     * than from the player), so it is never reconciled against the file: a
     * wrong value is silent and permanent. Measure the asset, and do not copy
     * the mocked duration off a design.
     */
    durationMs: z.number().int().positive(),
    /** Optional still frame, painted as the base layer under the video. */
    posterUrl: z.string().url().optional(),
  })
  .meta({ id: "ChatIntroVideo" });

/** What the chat screen needs to render itself, served with the history. */
export const ChatScreenConfig = z
  .object({
    /**
     * False when this user's variant grants no chat — the screen is read-only.
     * Always equivalent to `agentId !== null`; sent explicitly so the client
     * reads intent rather than inferring it, and matches the same-named field
     * on `GET /users/me`.
     */
    enabled: z.boolean(),
    /** Null when this user's variant grants no chat — the screen is read-only. */
    agentId: z.string().nullable(),
    title: z.string(),
    subtitle: z.string(),
    /**
     * Which named set `recommendedMessages` came from, so a chip tap can be
     * attributed to the exact set the user saw. Two agents serve different
     * sets and a set's copy changes over time, so this is NOT derivable from
     * the messages — see `SuggestionSet`.
     */
    suggestionSetId: z.string().optional(),
    recommendedMessages: z.array(RecommendedMessage),
    /**
     * The intro clip for THIS agent, or `null` when it has none.
     *
     * NULLABLE, not optional: the client always reads the key and branches on
     * its value, and `null` is the shipping state for two of the three live
     * agents (their assets do not exist yet). See `ChatIntroVideo`.
     */
    introVideo: ChatIntroVideo.nullable(),
  })
  .meta({ id: "ChatScreenConfig" });

/** `previousChat` is NEWEST FIRST. */
export const ChatHistoryResponse = z
  .object({
    success: z.literal(true),
    message: z.string(),
    data: z.object({
      /** Null when the caller has never opened a conversation. */
      sessionId: z.string().uuid().nullable(),
      previousChat: z.array(ChatMessage),
      nextCursor: z.string().nullable(),
      chatConfig: ChatScreenConfig,
    }),
  })
  .meta({ id: "ChatHistoryResponse" });

/**
 * Standard error envelope — a per-module clone so the OpenAPI emitter has a
 * distinct `id` per module (avoids component-name collisions).
 */
export const ErrorEnvelope = z
  .object({
    success: z.literal(false),
    message: z.string(),
    data: z.null(),
    errorCode: z.string().optional(),
  })
  .meta({ id: "ChatErrorEnvelope" });
