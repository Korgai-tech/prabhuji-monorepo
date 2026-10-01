import { Prisma } from "@prisma/client";
import { getPrisma } from "@api/shared/database";
import type { CursorKey } from "@api/shared/pagination";
import type { ChatRole } from "@api/core/chat/types";

/** A session row as the service consumes it (Dates left raw; the service maps). */
export interface ChatSessionRow {
  id: string;
  userId: string;
  agentId: string;
  providerSessionId: string | null;
  /** The deity the provider conversation was opened as; NULL off the persona agent. */
  personaSlug: string | null;
}

/**
 * A message row straight from the table.
 *
 * `rawResponse` is deliberately absent: it is an archive, not something any
 * caller reads back through this type. Query it directly when debugging.
 */
export interface ChatMessageRow {
  id: string;
  sessionId: string;
  role: ChatRole;
  content: string;
  providerMessageId: string | null;
  createdAt: Date;
}

/** The provider half of an exchange, as the repository stores it. */
export interface BotTurnInput {
  content: string;
  providerMessageId: string | null;
  /** The provider's whole response body; narrowed to Prisma's JSON type here. */
  raw: unknown;
}

/** Every field of a message EXCEPT the raw archive — see `ChatMessageRow`. */
const MESSAGE_SELECT = {
  id: true,
  sessionId: true,
  role: true,
  content: true,
  providerMessageId: true,
  createdAt: true,
} as const;

/**
 * Chat module repository — the ONLY place `@prisma/client` is reached for this
 * module (the service stays Prisma-free per arch-boundaries.json).
 *
 * OWNERSHIP CONTRACT (#EXPORT_CRITICAL): every read is scoped by `userId`, not
 * just `sessionId`. A session id is a uuid a client holds in local storage; if
 * the WHERE clause dropped the owner check, guessing one id would hand over
 * someone else's transcript. There is no repository method that takes a bare
 * session id.
 */
const SESSION_SELECT = {
  id: true,
  userId: true,
  agentId: true,
  providerSessionId: true,
  personaSlug: true,
} as const;

export class ChatRepository {
  async createSession(userId: string, agentId: string): Promise<ChatSessionRow> {
    return getPrisma().chatSession.create({
      data: { userId, agentId },
      select: SESSION_SELECT,
    });
  }

  /** Owner-scoped lookup — `null` covers both "no such session" and "not yours". */
  async findSession(
    userId: string,
    sessionId: string
  ): Promise<ChatSessionRow | null> {
    return getPrisma().chatSession.findFirst({
      where: { id: sessionId, userId },
      select: SESSION_SELECT,
    });
  }

  /**
   * The caller's most recent conversation, or `null` if they have none.
   *
   * Backs the session-less history read the chat screen makes on open. Ordered
   * by `createdAt` on the same `(user_id, created_at desc)` index the session
   * list uses.
   */
  async findLatestSession(userId: string): Promise<ChatSessionRow | null> {
    return getPrisma().chatSession.findFirst({
      where: { userId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: SESSION_SELECT,
    });
  }

  /**
   * Persist the provider's session handle — on the first answer, and again if
   * the provider ever hands back a different one (it does when it has forgotten
   * ours and the client opened a replacement).
   */
  async setProviderSessionId(
    sessionId: string,
    providerSessionId: string,
    personaSlug?: string
  ): Promise<void> {
    await getPrisma().chatSession.update({
      where: { id: sessionId },
      // `personaSlug` is written in the SAME statement as the handle it
      // describes, never separately: a handle stored without its deity would
      // read as "no drift" forever and pin the session to whatever the
      // provider conversation was opened as.
      data: { providerSessionId, ...(personaSlug === undefined ? {} : { personaSlug }) },
    });
  }

  /**
   * Records the deity a session's provider conversation was opened as, when
   * the provider gave us no new handle to write alongside it. Without this the
   * drift check would fire on every subsequent turn, reopening the RAGFlow
   * conversation each time and throwing away the persona's context.
   */
  async setPersonaSlug(sessionId: string, personaSlug: string): Promise<void> {
    await getPrisma().chatSession.update({
      where: { id: sessionId },
      data: { personaSlug },
    });
  }

  /**
   * The most recent `limit` messages of a session, NEWEST FIRST — the service
   * reverses them into chronological order before replaying them to the agent.
   *
   * Newest-first (rather than `take: -limit`) so the window is always the tail
   * of the conversation: what the agent needs is the last few turns, not the
   * first few, and it rides the same `(session_id, created_at desc)` index as
   * the paged read.
   */
  async findRecentMessages(
    sessionId: string,
    limit: number
  ): Promise<ChatMessageRow[]> {
    return getPrisma().chatMessage.findMany({
      where: { sessionId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit,
      select: MESSAGE_SELECT,
    });
  }

  /**
   * Write both turns of one exchange in a single transaction.
   *
   * Atomic on purpose: a user message stored without its answer is a transcript
   * that reads as an ignored question, and the provider call has already
   * happened by the time we get here, so there is nothing to roll back to.
   * Returns them in write order (user first).
   */
  async appendExchange(
    sessionId: string,
    userContent: string,
    bot: BotTurnInput
  ): Promise<[ChatMessageRow, ChatMessageRow]> {
    return getPrisma().$transaction(async (tx) => {
      const userMessage = await tx.chatMessage.create({
        // The user's turn has no provider fields — it never reached RAGFlow as
        // a message of its own, only as text inside our query.
        data: { sessionId, role: "user", content: userContent },
        select: MESSAGE_SELECT,
      });
      const botMessage = await tx.chatMessage.create({
        data: {
          sessionId,
          role: "bot",
          content: bot.content,
          providerMessageId: bot.providerMessageId,
          // The cast is the one place the provider's untyped body meets Prisma.
          // `DbNull` (not `JsonNull`) for a missing archive, so the column reads
          // as SQL NULL rather than a JSON `null` literal — the two are
          // different values in JSONB and only the former means "absent".
          rawResponse:
            bot.raw === undefined || bot.raw === null
              ? Prisma.DbNull
              : (bot.raw as Prisma.InputJsonValue),
        },
        select: MESSAGE_SELECT,
      });
      return [userMessage, botMessage];
    });
  }

  /**
   * One session's messages, NEWEST FIRST, keyset-paged on
   * `(createdAt desc, id desc)` — the exact shape of the
   * `(session_id, created_at desc)` index. Over-fetches by one row for
   * `buildPage`.
   */
  async findMessagePage(params: {
    sessionId: string;
    limit: number;
    afterKey?: CursorKey;
  }): Promise<ChatMessageRow[]> {
    const { sessionId, limit, afterKey } = params;
    const after = afterKey
      ? { createdAt: new Date(afterKey.sortOrder), id: afterKey.id }
      : null;
    return getPrisma().chatMessage.findMany({
      where: {
        sessionId,
        ...(after
          ? {
              // (createdAt, id) < (after.createdAt, after.id) — the tiebreak on
              // id matters because two turns of one exchange can land in the
              // same millisecond.
              OR: [
                { createdAt: { lt: after.createdAt } },
                {
                  AND: [{ createdAt: after.createdAt }, { id: { lt: after.id } }],
                },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
      select: MESSAGE_SELECT,
    });
  }
}
