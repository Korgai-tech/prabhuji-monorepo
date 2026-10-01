import { AppError } from "@api/shared/errors";
import { performServiceCall } from "@api/shared/workspace";
import { createModuleLogger } from "@api/shared/logs";
import { buildPage, decodeCursor } from "@api/shared/pagination";
import { resolveProEntitlement } from "@api/shared/entitlement";
import { RagflowClient, isChatProviderConfigured } from "@api/core/chat/repositories";
import type { ContentRepository, ContentRow } from "@api/core/chat/repositories";
import {
  groupContent,
  emptyContentGroups,
  parseAnswer,
  proseOnly,
  resolveContentIds,
} from "./chat.content.js";
import type { ParsedAnswer } from "./chat.content.js";
import {
  CHAT_INTRO_SUBTITLE,
  CHAT_INTRO_TITLE,
  introVideoForAgent,
  suggestionSetForAgent,
} from "./chat.constants.js";
import { evaluateAbtest } from "@api/shared/abtest";
import { resolveChatVariant } from "./chat.buckets.js";
import {
  CHAT_ABTEST_API_ID,
  CHAT_REQUIRES_PRO,
  agentForVariant,
  isKuldevtaPersonaAgent,
} from "./chat.constants.js";
import {
  CRISIS_RESPONSE,
  assessAgentError,
  assessAgentReply,
} from "./crisis-detection.service.js";
import type { PersonaIdentity } from "@api/core/kuldevta/api";
import type { ProviderAnswer } from "@api/core/chat/types";
import type {
  ChatMessageRow,
  ChatRepository,
  ChatSessionRow,
} from "@api/core/chat/repositories";
import type {
  ChatConfig,
  ChatHistoryResult,
  ChatMessage,
  ChatProvider,
  ContentGroups,
  GetHistoryArgs,
  SendMessageArgs,
  SendMessageResult,
} from "@api/core/chat/types";

const log = createModuleLogger("chat:service");

/**
 * How many past messages ride along with each question.
 *
 * A ceiling, not a tuned value: the agent's own system prompt already costs
 * ~9.3k tokens per call, and replayed history is pure added cost on every turn.
 * Ten messages is five exchanges — enough for pronouns and "tell me more" to
 * resolve. Raise it (or make it an env knob) only with token cost measured.
 */
const HISTORY_MESSAGE_LIMIT = 10;

/**
 * Chat business logic — Prisma-free, HTTP-free.
 *
 * MEMORY IS BELT AND BRACES. We send RAGFlow its own `providerSessionId` so it
 * has server-side context, AND replay the recent transcript inline (see
 * `composeQuery`). Measured against the live agent: turn two costs ~25,435
 * prompt tokens with the session id alone and ~25,487 with the replay too, so
 * the redundancy is ~52 tokens — RAGFlow replays the same history server-side
 * regardless. What it buys is that an expired provider session degrades into a
 * still-in-context answer instead of a silent memory reset.
 *
 * A session is still pinned to the agent it was opened with: `agentId` on a
 * follow-up is ignored rather than rejected, because a transcript answered by
 * two different agents is one no reader can interpret. Start a new session to
 * change agent.
 */
export class ChatService {
  private provider: ChatProvider | null;

  /**
   * `provider` is injected only by tests. In production it is built LAZILY on
   * the first message, not in the composition root: `RagflowClient`'s
   * constructor throws when credentials are absent, and a missing key must
   * degrade this one endpoint to a 503 — not crash-loop the task or make the
   * emitted OpenAPI contract depend on which env the emitter ran under.
   */
  constructor(
    private readonly repo: ChatRepository,
    private readonly content: ContentRepository,
    provider: ChatProvider | null = null
  ) {
    this.provider = provider;
  }

  /**
   * Whether this user has the chatbot, and which agent answers them.
   *
   * The A/B variant is the grant: a variant mapped in `RAGFLOW_AGENTS` enables
   * chat and names its agent, everything else is off. Read by the chat routes
   * as a gate and published on `GET /users/me` so the app can hide the entry
   * point entirely rather than offering a button that 403s.
   *
   * Resolved by the shared abtesting service when this env is configured for
   * it, and by the in-process bucket map (`chat.buckets.ts`) otherwise — which
   * is also the answer on every client failure, so the external dependency can
   * degrade this to exactly the old behaviour but never to "chat off".
   */
  async getChatConfig(userId: string): Promise<ChatConfig> {
    // FAIL CLOSED ON AN ENVIRONMENT WITH NO CHAT PROVIDER.
    //
    // The arm used to be resolved by an HTTP call to the shared experiment
    // service, and an environment without those credentials resolved no
    // variant — so "is chat configured here" was answered, by accident, by
    // that external dependency. Resolving the arm in-process removed the
    // accident: a salted hash of a user id succeeds everywhere, including an
    // environment with no RAGFlow behind it.
    //
    // Production deliberately leaves `RAGFLOW_BASE_URL` unset until launch.
    // Without this check it would report `enabled: true` with a real agent and
    // `show_kuldeveta_chat` for the kuldevta arm, the app would render the
    // entry point, and every tap would 503 — three quarters of users, at once,
    // with nothing the client could do about it.
    const variant = isChatProviderConfigured() ? await this.resolveVariant(userId) : null;
    const agentId = variant === null ? undefined : agentForVariant(variant);
    if (agentId === undefined) {
      log.info(
        { event: "chat_disabled_for_user", user_id: userId, variant },
        "chat not enabled for this user's variant"
      );
      return {
        enabled: false,
        agentId: null,
        // Carry the variant even when chat is off: an unmapped-but-non-null
        // variant is still a real bucket the warehouse wants to attribute the
        // funnel to. Null when there is no variant at all (no id, unreachable
        // service, or the null-labelled control range).
        chatType: variant,
        kuldevtaAssigned: false,
        showKuldevtaChat: false,
        kuldevtaName: null,
        requiresPro: CHAT_REQUIRES_PRO,
      };
    }
    const showKuldevtaChat = isKuldevtaPersonaAgent(agentId);
    // Only the kuldevta arm can act on this, so only it pays for the lookup —
    // and one lookup answers both "is there an assignment" and "what is it
    // called".
    const identity = showKuldevtaChat ? await this.kuldevtaIdentity(userId) : null;
    return {
      enabled: true,
      agentId,
      chatType: variant,
      kuldevtaAssigned: identity !== null,
      showKuldevtaChat,
      kuldevtaName: identity?.nameRoman ?? null,
      requiresPro: CHAT_REQUIRES_PRO,
    };
  }

  /**
   * The user's A/B variant: the shared abtesting service first, the in-process
   * bucket map on ANY client failure or unconfigured env (TAM-173).
   *
   * `inExperiment: false` is the one nuance. A `variant` key in the service's
   * api-default is an explicit console answer — a string hands every
   * out-of-experiment user that arm, anything else (null included) is chat OFF
   * for them. WITHOUT the key it reads as "nothing configured for chat there
   * yet" and falls back in-process, so wiring the credentials before seeding
   * experiments moves nobody.
   *
   * Either way the answer is a VARIANT, never an agent: it still has to pass
   * `VARIANT_AGENTS`, so the console cannot point our provider key at an agent
   * that reviewed source does not name.
   */
  private async resolveVariant(userId: string): Promise<string | null> {
    const evaluation = await evaluateAbtest(userId, CHAT_ABTEST_API_ID);
    if (evaluation === null) return resolveChatVariant(userId);
    if (evaluation.inExperiment) return evaluation.variantId;
    const defaults = evaluation.defaultConfig;
    if (defaults !== null && "variant" in defaults) {
      return typeof defaults.variant === "string" ? defaults.variant : null;
    }
    return resolveChatVariant(userId);
  }

  /**
   * `POST /chat/messages` — one full turn: resolve or open the session, replay
   * the recent transcript with the new question, then store both messages.
   *
   * ORDER MATTERS: nothing is written until the provider answers. Writing the
   * user's turn first would leave a dangling question in the transcript every
   * time the agent times out, and it would also pollute the history replayed on
   * the retry the client is about to send.
   */
  async sendMessage(args: SendMessageArgs): Promise<SendMessageResult> {
    // The gate is re-checked on EVERY turn, not just at session creation: a
    // variant remapped while a conversation is open must stop that
    // conversation, otherwise a user removed from the experiment keeps talking
    // to an agent nobody thinks they have.
    const config = await this.getChatConfig(args.userId);
    if (!config.enabled || config.agentId === null) {
      throw new AppError("Chat is not available", 403, "CHAT_DISABLED");
    }
    // The client must name the agent it thinks it is talking to, and it must be
    // the one this caller was actually granted. Checked, never used as a
    // selector: an id from the body must not be able to reach an agent the
    // caller's variant does not entitle them to.
    if (args.agentId !== config.agentId) {
      throw new AppError("Unknown agent", 400, "UNKNOWN_AGENT");
    }

    const session = args.sessionId
      ? await this.requireSession(args.userId, args.sessionId)
      : await this.repo.createSession(args.userId, config.agentId);
    // A session answers on the agent it was OPENED with. When the variant's
    // agent has since been repointed (TAM-264: content chat moved to a fixed
    // agent), an open conversation would otherwise stay on the old agent
    // forever. 400 UNKNOWN_AGENT makes the app drop the session and resend on
    // a fresh one, which opens on the current agent.
    if (session.agentId !== config.agentId) {
      throw new AppError("Unknown agent", 400, "UNKNOWN_AGENT");
    }

    // A brand-new session has no transcript to replay — skip the query.
    const history = args.sessionId
      ? await this.repo.findRecentMessages(session.id, HISTORY_MESSAGE_LIMIT)
      : [];

    // The kuldevta agent speaks as a DIFFERENT deity per user, so its identity
    // is injected per conversation rather than baked into the agent. RAGFlow
    // binds Begin variables once, at conversation creation, and never re-reads
    // them — which is why the identity is resolved on EVERY persona turn and
    // not only when opening one. A user who re-answers kuldevta-khoj onto a
    // different deity would otherwise keep the old conversation handle, and the
    // persona would go on answering as the previous deity forever: assignment
    // row says nagnechi, chat still says "Khandoba". The lookup is one indexed
    // read, and it is the only thing that can notice the drift.
    const persona = isKuldevtaPersonaAgent(session.agentId)
      ? await this.personaIdentity(args.userId)
      : null;

    // `personaSlug === null` on a session opened before this column existed:
    // unknown, not mismatched, so it is left alone rather than reset — the
    // first turn after this ships records the deity without disturbing a
    // conversation that is very probably correct.
    const deityChanged =
      persona !== null &&
      session.personaSlug !== null &&
      session.personaSlug !== persona.slug;

    if (deityChanged) {
      log.info(
        {
          event: "chat_persona_session_reset",
          user_id: args.userId,
          session_id: session.id,
          from_slug: session.personaSlug,
          to_slug: persona.slug,
        },
        "kuldevta re-assigned — opening a fresh provider conversation"
      );
    }

    // Dropping the handle is what forces RAGFlow to open a new conversation,
    // which is the only way new Begin inputs take effect.
    const providerSessionId = deityChanged ? null : session.providerSessionId;
    // Sent on EVERY persona turn, not only the one that opens the conversation.
    // RAGFlow substitutes Begin variables into the prompt on the turn they
    // arrive and never again, so omitting them on turn 2 empties the persona's
    // own identity. See the note in `RagflowClient.ask`.
    const inputs = persona?.inputs;

    let answer: ProviderAnswer;
    try {
      answer = await this.client().ask({
        agentId: session.agentId,
        query: composeQuery(history, args.message),
        ...(providerSessionId ? { sessionId: providerSessionId } : {}),
        ...(inputs ? { inputs } : {}),
      });
    } catch (err) {
      // A content-policy rejection screens the PROMPT, so on a distress
      // conversation the model never runs and never emits its sentinel — the
      // rejection is then the only signal that someone may be in danger.
      if (assessAgentError(err).crisis) {
        log.error({ event: "chat_crisis_on_error", user_id: args.userId }, "crisis turn");
        return this.crisisExchange(session.id, args.userId, args.message);
      }
      throw err;
    }

    if (assessAgentReply(answer.content).crisis) {
      log.error({ event: "chat_crisis_detected", user_id: args.userId }, "crisis turn");
      return this.crisisExchange(session.id, args.userId, args.message);
    }

    // Persist the provider handle on the first answer, and again whenever it
    // differs — the client opens a replacement session when the provider has
    // forgotten ours, and a stale handle would re-trigger that every turn.
    // The deity is written in the same statement (see `setProviderSessionId`),
    // so a handle can never be stored without the identity it was opened with.
    if (answer.sessionId && answer.sessionId !== session.providerSessionId) {
      await this.repo.setProviderSessionId(
        session.id,
        answer.sessionId,
        persona?.slug
      );
    } else if (deityChanged) {
      // The provider returned no handle (or the same one) on a turn we opened
      // fresh. The deity still moved, so record it — otherwise the next turn
      // sees the OLD slug and resets again, every single turn.
      await this.repo.setPersonaSlug(session.id, persona.slug);
    }

    const [userRow, botRow] = await this.repo.appendExchange(
      session.id,
      args.message,
      {
        content: answer.content,
        providerMessageId: answer.messageId,
        raw: answer.raw,
      }
    );

    const [userMessage, botMessage] = await this.toWireMessages(
      [userRow, botRow],
      args.userId
    );

    log.info(
      {
        event: "chat_message_exchanged",
        user_id: args.userId,
        session_id: session.id,
        agent_id: session.agentId,
        // NEVER log message content — it is user-authored free text.
        query_length: args.message.length,
        answer_length: answer.content.length,
        history_messages: history.length,
        provider_message_id: answer.messageId,
        new_session: args.sessionId === undefined,
      },
      "chat exchange stored"
    );

    if (userMessage === undefined || botMessage === undefined) {
      // Unreachable: `appendExchange` writes exactly two rows in a transaction.
      throw new AppError("Failed to store the exchange", 500, "CHAT_WRITE_FAILED");
    }
    return {
      sessionId: session.id,
      agentId: session.agentId,
      userMessage,
      botMessage,
    };
  }

  /**
   * The chat screen's whole opening payload: the transcript plus what to render
   * around it.
   *
   * `sessionId` is OPTIONAL because this is what the screen calls on open, and
   * a first-time user has no session id to name — omitting it means "my most
   * recent conversation", and a user with none gets an empty transcript and the
   * intro copy rather than a 404.
   *
   * NOT gated on the A/B grant, unlike sending. A user whose variant stops
   * granting chat can still read what they already said; hiding their own words
   * would be a surprise with no upside, and `chatConfig.agentId` going null
   * already tells the client the screen is read-only.
   */
  async getHistory(args: GetHistoryArgs): Promise<ChatHistoryResult> {
    const config = await this.getChatConfig(args.userId);
    const suggestions = suggestionSetForAgent(config.agentId);
    const chatConfig = {
      enabled: config.enabled,
      agentId: config.agentId,
      title: CHAT_INTRO_TITLE,
      subtitle: CHAT_INTRO_SUBTITLE,
      suggestionSetId: suggestions.id,
      recommendedMessages: suggestions.messages.map((m) => ({ ...m })),
      // `null` for every agent without an asset — the shipping state for two of
      // the three live agents, not an error. Resolved per request so the URL
      // carries THIS environment's media host.
      introVideo: introVideoForAgent(config.agentId),
    };

    // Decoded BEFORE the session lookup so a malformed cursor is always a 400.
    // Behind the early return it would be silently ignored for a user with no
    // history yet, and the same request would start failing the moment they
    // sent their first message.
    const afterKey = args.cursor ? decodeCursor(args.cursor) : undefined;

    const session = args.sessionId
      ? await this.requireSession(args.userId, args.sessionId)
      : await this.repo.findLatestSession(args.userId);

    if (session === null) {
      return {
        sessionId: null,
        previousChat: [],
        nextCursor: null,
        chatConfig,
      };
    }

    const rows = await this.repo.findMessagePage({
      sessionId: session.id,
      limit: args.limit,
      ...(afterKey ? { afterKey } : {}),
    });
    const page = buildPage(rows, args.limit, (row) => ({
      sortOrder: row.createdAt.getTime(),
      id: row.id,
    }));
    return {
      sessionId: session.id,
      previousChat: await this.toWireMessages(page.items, args.userId),
      nextCursor: page.nextCursor,
      chatConfig,
    };
  }

  /**
   * Turn stored rows into what the client reads: the agent's envelope unwrapped
   * and its content tags resolved against our catalogue.
   *
   * Content ids are collected across the WHOLE page and looked up once, so a
   * thirty-message history costs five queries rather than five per message. The
   * Pro entitlement is likewise resolved once for the batch.
   */
  /**
   * This user's deity for the launch payload, or `null` when they have not
   * completed kuldevta-khoj.
   *
   * Returns the whole identity rather than a boolean because the payload needs
   * two things from it — whether there IS an assignment, and the name to put in
   * the chat header — and one lookup answers both.
   *
   * Never throws: this sits on the app-launch path, and a kuldevta module that
   * is slow or unregistered must not take `GET /users/me` down with it. An
   * unreadable answer degrades to `null`, which shows the user the
   * identification CTA — a wasted tap, not a broken launch.
   */
  private async kuldevtaIdentity(userId: string): Promise<PersonaIdentity | null> {
    try {
      return await performServiceCall(
        "kuldevta",
        (api) => api.getPersonaIdentity(userId),
        `chat.kuldevtaIdentity(${userId})`,
        "Could not load your kuldevta"
      );
    } catch (err) {
      log.warn(
        {
          event: "kuldevta_assignment_lookup_failed",
          user_id: userId,
          error: err instanceof Error ? err.message : String(err),
        },
        "could not resolve kuldevta assignment for the launch payload"
      );
      return null;
    }
  }

  /**
   * The deity identity for this user's persona conversation, in the
   * `{ type, value }` form RAGFlow's Begin node requires. The two `paragraph`
   * types are named rather than defaulted: sending `line` for a `paragraph`
   * variable is accepted by the HTTP layer and fails inside canvas evaluation.
   *
   * A user in the kuldevta arm who has not answered the six questions yet gets
   * a 409 naming the step they are missing, not a 500 — "no kuldevta yet" is an
   * ordinary state, and the app routes them to kuldevta-khoj on that code.
   *
   * Returns the slug alongside the inputs because the caller needs to know
   * WHICH deity these inputs describe, in order to detect that a session's
   * provider conversation was opened as a different one.
   */
  private async personaIdentity(
    userId: string
  ): Promise<{ slug: string; inputs: Record<string, { type: string; value: string }> }> {
    const identity = await performServiceCall(
      "kuldevta",
      (api) => api.getPersonaIdentity(userId),
      `chat.personaInputs(${userId})`,
      "Could not load your kuldevta"
    );
    if (!identity) {
      throw new AppError(
        "Complete kuldevta-khoj before chatting with your kuldevta",
        409,
        "KULDEVTA_NOT_ASSIGNED"
      );
    }
    const line = (value: string) => ({ type: "line", value });
    const paragraph = (value: string) => ({ type: "paragraph", value });
    const inputs = {
      kuldevta_slug: line(identity.slug),
      name: line(identity.nameRoman),
      gender: line(identity.gender),
      tone_notes: paragraph(identity.toneNotes ?? ""),
      archetype_voice: paragraph(identity.archetypeVoice),
      niyam: paragraph(identity.niyam.join("; ")),
      mantra: line(identity.mantra ?? ""),
      temple: line(identity.templeVillage ?? ""),
    };
    return { slug: identity.slug, inputs };
  }

  /**
   * Persists the user's turn and returns the crisis card in place of the
   * agent's answer.
   *
   * The agent's reply is DISCARDED, never stored and never sent: on the
   * sentinel path it is the literal string `DISTRESS_DETECTED`, and on the
   * content-policy path there is no reply at all. The user's own message is
   * still persisted, because a transcript that silently drops the most
   * important thing someone said is worse than no transcript.
   */
  private async crisisExchange(
    sessionId: string,
    userId: string,
    message: string
  ): Promise<SendMessageResult> {
    const [userRow, botRow] = await this.repo.appendExchange(sessionId, message, {
      content: CRISIS_RESPONSE.text,
      providerMessageId: null,
      raw: { crisis: true },
    });
    const [userMessage, botMessage] = await this.toWireMessages([userRow, botRow], userId);
    const session = await this.requireSession(userId, sessionId);
    return { sessionId, agentId: session.agentId, userMessage, botMessage };
  }

  private async toWireMessages(
    rows: readonly ChatMessageRow[],
    userId: string
  ): Promise<ChatMessage[]> {
    const parsed = rows.map((row) =>
      row.role === "bot"
        ? parseAnswer(row.content)
        // A user turn has no envelope to unwrap and no analytics of its own —
        // same all-null shape as a prose agent's reply.
        : proseOnly(row.content)
    );

    const allTags = parsed.flatMap((p) => p.contentIds);
    if (allTags.length === 0) {
      return rows.map((row, i) =>
        toWire(row, parsed[i], emptyContentGroups())
      );
    }

    // Pro is resolved only when there is actually content to gate.
    const [isPro, contentRows] = await Promise.all([
      resolveProEntitlement(userId, "chat:content"),
      this.content.findByTypeAndIds(resolveContentIds(allTags)),
    ]);
    const byId = new Map<string, ContentRow>(contentRows.map((r) => [r.id, r]));

    return rows.map((row, i) => {
      const p = parsed[i];
      const ids = resolveContentIds(p?.contentIds ?? []);
      const mine = [...ids.values()]
        .flat()
        .map((id) => byId.get(id))
        .filter((r): r is NonNullable<typeof r> => r !== undefined);
      return toWire(row, p, groupContent(mine, isPro));
    });
  }

  private async requireSession(
    userId: string,
    sessionId: string
  ): Promise<ChatSessionRow> {
    const session = await this.repo.findSession(userId, sessionId);
    if (!session) throw new AppError("Chat session not found", 404, "NOT_FOUND");
    return session;
  }

  private client(): ChatProvider {
    return (this.provider ??= new RagflowClient());
  }
}

/**
 * Fold the recent transcript and the new question into the single `query` the
 * agent accepts.
 *
 * Rows arrive newest-first from the repository and are reversed here, because a
 * conversation only reads correctly oldest-first. With no history the question
 * is sent bare — a wrapper announcing an empty conversation is noise the agent
 * would have to reason past.
 *
 * The format ("User:" / "Assistant:" lines under a `Previous conversation:`
 * heading) was verified against the live agent: a pronoun in the new message
 * resolves against the replayed turns and comes back as `intent_type:
 * "followup"`.
 */
function composeQuery(history: ChatMessageRow[], message: string): string {
  if (history.length === 0) return message;
  const transcript = [...history]
    .reverse()
    .map(
      (row) =>
        `${row.role === "user" ? "User" : "Assistant"}: ${replayText(row)}`
    )
    .join("\n");
  return `Previous conversation:\n${transcript}\n\nCurrent message: ${message}`;
}

/**
 * What a stored message looks like when replayed back to the agent.
 *
 * The agent answers with a JSON document, and we store it verbatim (the client
 * needs the structured fields). Replaying that raw would feed it back its own
 * `null`s and `[SUGGESTED: ...]` trailer as if they were conversation — noise
 * that costs tokens and invites it to imitate the wrapper instead of the
 * content. So we replay `reply_text` when the row parses as that shape, and
 * fall back to the raw string when it does not: a stored message must never be
 * unreplayable just because the agent's output format changed.
 */
function replayText(row: ChatMessageRow): string {
  if (row.role === "user") return row.content;
  try {
    const parsed: unknown = JSON.parse(
      row.content.split("\n[SUGGESTED:")[0] ?? ""
    );
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      typeof (parsed as { reply_text?: unknown }).reply_text === "string"
    ) {
      return (parsed as { reply_text: string }).reply_text;
    }
  } catch {
    // Not the JSON shape — fall through to the raw content.
  }
  return row.content;
}

function toWire(
  row: ChatMessageRow,
  parsed: ParsedAnswer | undefined,
  content: ContentGroups
): ChatMessage {
  return {
    id: row.id,
    sessionId: row.sessionId,
    role: row.role,
    message: parsed?.replyText ?? row.content,
    confidence: parsed?.confidence ?? null,
    content,
    matchedTags: parsed?.contentIds ?? [],
    intentType: parsed?.intentType ?? null,
    recommendedDeity: parsed?.recommendedDeity ?? null,
    jaapCount: parsed?.jaapCount ?? null,
    declineCategory: parsed?.declineCategory ?? null,
    // Recomputed from the stored text rather than read from a column.
    // `crisisExchange` writes this exact constant as the bot's `content`, so
    // the comparison is total: it holds for a live exchange and for the same
    // turn replayed out of history months later, with no migration, no extra
    // SELECT, and no way for a flag column to drift from the text beside it.
    // The user's own turn is never equal to it, which is the wanted answer —
    // the flag describes what was rendered, and the card renders on the bot
    // bubble.
    distressDetected: row.role === "bot" && row.content === CRISIS_RESPONSE.text,
    createdAt: row.createdAt.toISOString(),
  };
}
