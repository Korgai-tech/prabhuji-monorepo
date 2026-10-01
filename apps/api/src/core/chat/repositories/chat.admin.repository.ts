import { getPrisma } from "@api/shared/database";
import type { ChatRole } from "@api/core/chat/types";

/** One session as the admin transcript reads it. */
export interface AdminChatSessionRow {
  id: string;
  agentId: string;
  personaSlug: string | null;
  createdAt: Date;
}

/**
 * One message as the admin transcript reads it.
 *
 * `content` is the row VERBATIM — for a bot turn that is still the agent's
 * envelope, which the service unwraps with the same `parseAnswer` the mobile
 * client's history goes through. Reading it raw here and unwrapping in the
 * service is what guarantees the CMS shows the text the user actually saw
 * rather than a second, drifting interpretation of the envelope.
 *
 * `rawResponse` is deliberately absent, as it is on `ChatMessageRow`: it is a
 * debugging archive that can be megabytes per page and no transcript renders it.
 */
export interface AdminChatMessageRow {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: Date;
}

const SESSION_SELECT = {
  id: true,
  agentId: true,
  personaSlug: true,
  createdAt: true,
} as const;

const MESSAGE_SELECT = {
  id: true,
  role: true,
  content: true,
  createdAt: true,
} as const;

/**
 * Read-only Prisma access for the `/admin/chat/*` surface.
 *
 * SEPARATE FROM `ChatRepository` ON PURPOSE. That class carries an ownership
 * contract — every read is scoped by `userId` and no method takes a bare
 * session id — because its callers are serving a request made BY the session's
 * owner, where a missing owner predicate is an IDOR. Admin is the one caller
 * that legitimately reads someone else's transcript, so it gets its own class
 * rather than a `userId`-less method bolted onto the user-facing one, where it
 * would be one careless import away from the mobile read path.
 *
 * The containment here is different and stated plainly: every route reaching
 * this goes through `registerAdminRoute`, i.e. `[authMiddleware,
 * adminMiddleware]` with no opt-out. `findMessageTail` does take a bare session
 * id — the only such method in the module — and it is safe ONLY because the ids
 * it is given always come from `findSessionPage`, which IS user-scoped. Do not
 * pass it an id that arrived from a client.
 *
 * There is no write method here and there must never be one: a transcript is an
 * immutable record (`ChatMessage` has no `updatedAt`), and an admin surface that
 * could edit what a user said would destroy that.
 */
export class ChatAdminRepository {
  /** Total sessions for the user — the `total` of the ADR §C2 page envelope. */
  async countSessions(userId: string): Promise<number> {
    return getPrisma().chatSession.count({ where: { userId } });
  }

  /**
   * One offset page of a user's sessions, NEWEST FIRST — the
   * `(user_id, created_at desc)` index exactly. The CMS renders them reversed
   * (newest at the BOTTOM, like a chat screen); newest-first here is what makes
   * page 1 the recent conversations rather than whatever the user said in 2024.
   */
  async findSessionPage(params: {
    userId: string;
    skip: number;
    take: number;
  }): Promise<AdminChatSessionRow[]> {
    const { userId, skip, take } = params;
    return getPrisma().chatSession.findMany({
      where: { userId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip,
      take,
      select: SESSION_SELECT,
    });
  }

  /**
   * `sessionId -> stored message count`, for the sessions on this page, in ONE
   * query.
   *
   * Counted rather than derived from `findMessageTail`'s length because the tail
   * is capped: a session the cap truncated must still be able to say "showing
   * the last 500 of 812" instead of silently presenting a partial conversation
   * as the whole thing.
   *
   * A session with no messages is ABSENT from the result (`groupBy` has no row
   * to group) — callers default to 0.
   */
  async countMessagesBySession(
    sessionIds: readonly string[]
  ): Promise<Map<string, number>> {
    if (sessionIds.length === 0) return new Map();
    const rows = await getPrisma().chatMessage.groupBy({
      by: ["sessionId"],
      where: { sessionId: { in: [...sessionIds] } },
      _count: { _all: true },
    });
    return new Map(rows.map((row) => [row.sessionId, row._count._all]));
  }

  /**
   * The LAST `limit` messages of one session, newest first (the service
   * reverses them into reading order).
   *
   * The tail and not the head: when a conversation is too long to render whole,
   * what an editor opened this page to see is how it ended. Rides the same
   * `(session_id, created_at desc)` index as the mobile paged read.
   *
   * See the class note — `sessionId` must come from `findSessionPage`.
   */
  async findMessageTail(
    sessionId: string,
    limit: number
  ): Promise<AdminChatMessageRow[]> {
    return getPrisma().chatMessage.findMany({
      where: { sessionId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit,
      select: MESSAGE_SELECT,
    });
  }
}
