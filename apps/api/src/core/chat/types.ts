/**
 * Chat module internal types.
 *
 * `ChatSession.id` is conversation identity — ours, and what the app passes
 * around. `providerSessionId` is RAGFlow's own handle, stored alongside it and
 * sent on later turns. We replay our transcript inline as well, so a lost or
 * expired provider session degrades into a still-coherent answer instead of a
 * silent memory reset.
 *
 * Wire shapes live in `routes/chat.schemas.ts`; these are what the layers pass
 * between themselves.
 */

/** Who wrote a message. Mirrors the `chat_role` enum in the database. */
export const CHAT_ROLES = ["user", "bot"] as const;
export type ChatRole = (typeof CHAT_ROLES)[number];

/**
 * One turn as the CLIENT sees it — not what we store.
 *
 * The provider's envelope is unwrapped here: `message` is the agent's
 * `reply_text` (or the user's own text), `confidence` its self-report, and
 * `content` its `content_ids` already resolved against our catalogue. The raw
 * provider body stays in the database for debugging and never reaches the wire.
 */
export interface ChatMessage {
  /** OUR row id, not the provider's message id. */
  id: string;
  sessionId: string;
  role: ChatRole;
  message: string;
  /** The agent's self-reported confidence. Null on a user turn. */
  confidence: string | null;
  content: ContentGroups;
  /**
   * The agent's OWN content tags for this turn (`art_0011`, `mnt_0066`) —
   * what it matched on, before we resolved them against our catalogue.
   *
   * Not the same list as `content`, and that difference is the point: a tag the
   * agent matched but our id map cannot place is dropped from `content`
   * silently, and appears here only. A tag present here and absent there is
   * therefore a catalogue gap, which is the thing worth counting.
   *
   * Always `[]` on a user turn and on the two agents that reply in prose.
   */
  matchedTags: string[];
  /** See `ParsedAnswer.intentType`. Null on a user turn and on prose agents. */
  intentType: string | null;
  /** See `ParsedAnswer.recommendedDeity`. Null on ~80% of bot turns. */
  recommendedDeity: string | null;
  /** See `ParsedAnswer.jaapCount`. */
  jaapCount: number | null;
  /** See `ParsedAnswer.declineCategory`. */
  declineCategory: string | null;
  /**
   * This turn was answered with the crisis card instead of the agent's reply.
   *
   * True on the BOT message of a crisis exchange, false everywhere else — the
   * user's own turn stays false even though it is what triggered the card,
   * because the flag describes what was RENDERED, and the client renders it on
   * the bot bubble.
   *
   * Survives history replay: the crisis text is a constant we write ourselves,
   * so a replayed transcript flags the same turns as the live exchange did,
   * with no extra column and no second query.
   *
   * ⚠️ This is health-adjacent data about a named user. It exists so the client
   * can render the helpline card and count how often it fires — it must not be
   * joined to message text in any warehouse table.
   */
  distressDetected: boolean;
  /** OUR timestamp, ISO-8601 UTC. */
  createdAt: string;
}

/** The content kinds an agent may recommend. Keys of the `content` map. */
export const CHAT_CONTENT_TYPES = [
  "aarti",
  "bhajan",
  "mantra",
  "ringtone",
  "status",
  "wallpaper",
  /**
   * The zodiac signs, from `zodiac_sign`. Unlike the six above, a horoscope is
   * not a playable catalogue row — the item points at a SIGN, and the reading
   * itself comes from `GET /horoscope/daily?zodiac=…`. So `playUrl` is always
   * null and the client navigates rather than plays.
   */
  "horoscope",
] as const;
export type ChatContentType = (typeof CHAT_CONTENT_TYPES)[number];

/** One recommended item as the client receives it. */
export interface ContentItem {
  id: string;
  /** CMS-authored display title — what the card actually shows to the user. */
  title: string;
  /** Null for a free caller on Pro-gated audio, or when the row has no asset. */
  playUrl: string | null;
  icon: string;
}

/**
 * Recommendations grouped by kind. EVERY key is always present, empty when
 * nothing of that kind was recommended, so the client never branches on
 * undefined.
 */
export type ContentGroups = Record<ChatContentType, ContentItem[]>;

/** Args to `ChatService.sendMessage` — JWT subject + validated body. */
export interface SendMessageArgs {
  userId: string;
  message: string;
  /**
   * The agent the client believes it is talking to, from `GET /users/me`.
   * Checked against the caller's own A/B grant, never trusted as a selector.
   */
  agentId: string;
  /** Continue this conversation. Omitted → a new session is opened. */
  sessionId?: string;
}

/**
 * Whether this user has the chatbot, and who answers it.
 *
 * Derived from the user's A/B variant: a variant mapped in `RAGFLOW_AGENTS`
 * grants chat and names its agent; anything else (the `control` arm, an
 * unmapped variant, no experiment, or an unreachable A/B service) is off with
 * no agent. `enabled === false` always means `agentId === null` — the two can
 * never disagree, because they are read from one map.
 */
export interface ChatConfig {
  enabled: boolean;
  agentId: string | null;
  /**
   * The A/B variant name this user was assigned to (`kuldevta_chat`,
   * `bhagwat_gita_chat`, `content_chat`, …) — the opaque bucket label mobile
   * analytics groups events by so the warehouse can slice funnels by arm
   * without joining back through `/users/me`. Null when the user has no
   * assignment (control, an unmapped variant, an unreachable A/B service, or
   * no id to bucket on) — i.e. exactly when `agentId` is null. Read verbatim;
   * the value is the same string the bucket map / A/B console publishes.
   */
  chatType: string | null;
  /**
   * Whether this user has a kuldevta assigned, so the launch payload can pick
   * the right call to action — "Talk to your kuldevta" versus "Find your
   * kuldevta" — without a second round trip.
   *
   * MEANINGFUL ONLY IN THE KULDEVTA ARM. It is `false` for everyone else, and
   * that `false` says "not applicable", not "this user has no kuldevta": the
   * lookup is skipped entirely outside the arm so `GET /users/me`, which every
   * app launch hits, does not pay for a query three quarters of users cannot
   * act on. Read it together with `agentId`, never alone.
   */
  kuldevtaAssigned: boolean;
  /**
   * Whether the agent this user was granted IS the kuldevta persona agent —
   * i.e. whether to show the kuldevta chat entry point at all.
   *
   * Derivable from `agentId`, but only by a client that hardcodes the agent's
   * hex id. That id is provider state: it changes whenever the agent is
   * republished as a new one (it already has, twice), and a shipped app cannot
   * be corrected when it does. Publishing the boolean keeps "which arm is
   * this" a server decision, which is where the bucket map already lives.
   *
   * Unlike `kuldevtaAssigned`, this is meaningful for EVERY user: `false` here
   * means "not in the kuldevta arm", and it is the flag that decides whether
   * `kuldevtaAssigned` is worth reading at all.
   */
  showKuldevtaChat: boolean;
  /**
   * The deity's name, for the chat header — or `null` when there is none to
   * show.
   *
   * `null` covers BOTH "not in the kuldevta arm" and "in the arm but has not
   * answered the six questions yet", because a client has nothing different to
   * render for those two: `showKuldevtaChat` and `kuldevtaAssigned` already
   * distinguish them, and duplicating that distinction in a third field only
   * creates a way for the three to disagree.
   *
   * The ROMAN name ("Khandoba"), not the Devanagari one. The persona agent is
   * given `nameRoman` as its own `name` input, so this is the name the bot
   * calls itself by in its replies — a header spelling it differently would
   * read as a different deity. `GET /kuldevta/identify` publishes both, so the
   * result screen is free to choose.
   *
   * Costs no extra query: the assignment lookup that already resolves
   * `kuldevtaAssigned` returns the whole identity.
   */
  kuldevtaName: string | null;
  /**
   * Whether the app should Pro-gate chat for this user. Mirrors the
   * `CHAT_REQUIRES_PRO` switch verbatim — see the long note on that constant
   * for why the decision is published rather than compiled into the app.
   *
   * Server-side this field GATES NOTHING: `POST /chat/messages` has never
   * checked entitlement and still does not, so a client that ignores the flag
   * is not stopped by it. It is a client-behaviour instruction, not a
   * permission — which is exactly why it is safe to turn off without an audit,
   * and why turning it back on is not by itself a security control.
   *
   * Sent on BOTH branches, including the chat-disabled one where it cannot
   * matter, so the key is never absent from a live server's payload. A client
   * that sees it missing is talking to a server that predates it, and reads
   * that as `false` (ungated).
   */
  requiresPro: boolean;
}

/** What `POST /chat/messages` returns: the session id plus both turns. */
export interface SendMessageResult {
  sessionId: string;
  agentId: string;
  userMessage: ChatMessage;
  botMessage: ChatMessage;
}

/** The chat screen's opening state, served alongside the history. */
export interface ChatScreenConfig {
  /**
   * Whether this user may send. Always `agentId !== null` — stated explicitly
   * so the client asks the question it means rather than inferring intent from
   * a null id, and so it matches `chatConfig.enabled` on `GET /users/me`.
   */
  enabled: boolean;
  agentId: string | null;
  title: string;
  subtitle: string;
  /**
   * Which named opener set `recommendedMessages` came from, so a chip tap is
   * attributable to the exact set the user saw. Not derivable from the
   * messages — see `SuggestionSet` in `chat.constants.ts`.
   */
  suggestionSetId: string;
  recommendedMessages: {
    id: string;
    order: number;
    text: string;
    category: "mood" | "content" | "horoscope" | "scripture";
  }[];
  /**
   * The agent's intro clip, URLs already resolved for this environment, or
   * `null` when it has none. NULLABLE BY DESIGN — two of the three live agents
   * have no asset yet and ship `null`, which the client renders as "no video
   * card", not as a failure. See `IntroVideo` in `chat.constants.ts`.
   */
  introVideo: {
    videoId: string;
    url: string;
    durationMs: number;
    posterUrl?: string;
  } | null;
}

/** What the history endpoint returns. */
export interface ChatHistoryResult {
  sessionId: string | null;
  previousChat: ChatMessage[];
  nextCursor: string | null;
  chatConfig: ChatScreenConfig;
}

/** Args to `ChatService.getHistory` — one session's transcript, newest first. */
export interface GetHistoryArgs {
  userId: string;
  /** Omitted → the caller's most recent conversation, if they have one. */
  sessionId?: string;
  cursor?: string;
  limit: number;
}

/**
 * The provider seam. `repositories/ragflow.client.ts` is the only implementation;
 * the service depends on this interface so its tests need no HTTP.
 *
 * `sessionId` in is the provider handle we hold (absent on the first turn);
 * `sessionId` out is the handle to persist — which may DIFFER from the one sent
 * if the provider had forgotten ours and the client opened a fresh session.
 */
export interface ChatProvider {
  ask(params: {
    agentId: string;
    query: string;
    sessionId?: string;
    /**
     * RAGFlow Begin-component variables, sent only when opening a session.
     *
     * RAGFlow will not accept these as bare strings — each must arrive as
     * `{ type, value }`, with `type` matching what the agent's Begin node
     * declares. A mismatch is not rejected at the HTTP layer: the call returns
     * `code: 0` with an error string in the body, so nothing upstream notices.
     */
    inputs?: Record<string, { type: string; value: string }>;
  }): Promise<ProviderAnswer>;
}

/** One provider answer: what we serve, plus everything we archive around it. */
export interface ProviderAnswer {
  /** The answer text we store as `content` and return to the client. */
  content: string;
  /** The handle to persist on the session (may differ from the one we sent). */
  sessionId: string | null;
  /** RAGFlow's `message_id` for this answer. */
  messageId: string | null;
  /**
   * The provider's entire parsed response body, archived verbatim as JSONB.
   * `unknown` because it is THEIR contract: nothing in our code may depend on
   * its shape, and the repository is the only place it is narrowed.
   */
  raw: unknown;
}
