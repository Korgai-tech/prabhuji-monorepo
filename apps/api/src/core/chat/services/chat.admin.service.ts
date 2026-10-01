import { AppError } from "@api/shared/errors";
import { performServiceCall } from "@api/shared/workspace";
import type {
  AdminChatMessageRow,
  AdminChatSessionRow,
  ChatAdminRepository,
  ContentRepository,
  ContentRow,
} from "@api/core/chat/repositories";
import type { ChatContentType } from "@api/core/chat/types";
import {
  lookupContentTag,
  parseAnswer,
  proseOnly,
  resolveContentIds,
} from "./chat.content.js";
import { variantForAgent } from "./chat.constants.js";

/**
 * How many messages of one session the transcript renders, counted from the END
 * of the conversation.
 *
 * A cap and not a page: chat sessions here run to tens of turns, so this never
 * trips in practice, and paging inside every session would be machinery for a
 * case that does not occur. When it DOES trip, the response says so per session
 * (`messageCount` vs `messages.length`, plus `truncated`) rather than quietly
 * presenting a tail as the whole conversation.
 *
 * It lives in the SERVICE and not next to the Zod query: it is not something a
 * caller may ask for, so it is not a request parameter. `services/` is also
 * forbidden from importing `routes/` (`arch-boundaries.json`), so a constant the
 * service enforces cannot be declared in the schema file.
 */
export const ADMIN_CHAT_MESSAGE_CAP = 500;

/** What the CMS asked for: one user, one offset page of their sessions. */
export interface GetTranscriptArgs {
  userId: string;
  page: number;
  pageSize: number;
}

export interface TranscriptUser {
  id: string;
  name: string | null;
  phoneCountryCode: string | null;
  phoneNumber: string | null;
}

/**
 * One thing the agent recommended on a turn, as the CMS shows it.
 *
 * `title` is null when the tag could not be resolved — either it is absent from
 * the id map, or the row it names has been deactivated or deleted in the CMS.
 * Both are worth SEEING rather than hiding: a bot turn whose card rendered
 * empty in the app is one of the things an editor opens this page to explain,
 * and an empty list would look identical to "recommended nothing".
 */
export interface TranscriptRecommendation {
  /** The agent's own tag, e.g. `art_0011`. Always present. */
  tag: string;
  type: ChatContentType | null;
  title: string | null;
}

export interface TranscriptMessage {
  id: string;
  role: "user" | "bot";
  message: string;
  confidence: string | null;
  /**
   * What this turn recommended. Always an array — empty on every user turn and
   * on the two prose agents, which recommend nothing at all.
   *
   * NO `playUrl` and no Pro gating, unlike the mobile history: the question
   * this page answers is WHAT was recommended, not whether this particular user
   * could play it. Skipping it also keeps the entitlement lookup off an
   * admin read.
   */
  recommendations: TranscriptRecommendation[];
  createdAt: string;
}

export interface TranscriptSession {
  id: string;
  agentId: string;
  variant: string | null;
  personaSlug: string | null;
  createdAt: string;
  messageCount: number;
  truncated: boolean;
  messages: TranscriptMessage[];
}

export interface TranscriptResult {
  user: TranscriptUser;
  items: TranscriptSession[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * Read side of the CMS chat-transcript viewer (`GET /admin/chat/transcript`).
 *
 * A SEPARATE service from `ChatService`, not a method on it. `ChatService`
 * carries the provider client, the A/B resolver, the crisis detector and the
 * content catalogue — everything needed to CONDUCT a conversation. Reading one
 * back needs none of that, and hanging an admin method off that class would put
 * an admin entry point on the object the mobile send path already holds. The
 * split mirrors `core/pinned-content`, which registers its read-path lookup
 * service separately from its write-path one for the same reason.
 *
 * Read-only by construction: its repository has no write method.
 */
export class ChatAdminService {
  constructor(
    private readonly repo: ChatAdminRepository,
    private readonly content: ContentRepository
  ) {}

  async getTranscript(args: GetTranscriptArgs): Promise<TranscriptResult> {
    const { userId, page, pageSize } = args;

    // Resolved FIRST, and a 404 when it misses. An unknown id and a user who
    // has simply never opened chat both produce zero sessions, and on a page
    // whose only input is a hand-pasted uuid those must not look the same —
    // otherwise a typo reads as "this user never used the bot".
    const user = await performServiceCall(
      "users",
      (svc) => svc.getUserPublic(userId),
      "chat:admin:getTranscript",
      "Failed to resolve the user"
    );
    if (user === null) throw new AppError("User not found", 404, "NOT_FOUND");

    const [total, sessions] = await Promise.all([
      this.repo.countSessions(userId),
      this.repo.findSessionPage({
        userId,
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    const sessionIds = sessions.map((s) => s.id);
    // Counts for the whole page in one query; the tails one query each. The
    // per-session queries are what buy an exact, index-backed "last N of THIS
    // conversation" — a single `IN (…)` read with a global cap could only
    // truncate across session boundaries, dropping whole conversations at the
    // bottom of the page rather than the oldest turns of a long one.
    const [counts, tails] = await Promise.all([
      this.repo.countMessagesBySession(sessionIds),
      Promise.all(
        sessionIds.map((id) => this.repo.findMessageTail(id, ADMIN_CHAT_MESSAGE_CAP))
      ),
    ]);

    // Recommendations are resolved for the WHOLE page in one batch, the same
    // way `ChatService` does it for the mobile history: a page of ten sessions
    // costs six catalogue queries, not six per bot turn.
    const titles = await this.resolveTitles(tails.flat());

    const items = sessions.map((session, i) =>
      this.toTranscriptSession(
        session,
        tails[i] ?? [],
        counts.get(session.id) ?? 0,
        titles
      )
    );

    return {
      user: {
        id: user.id,
        name: user.name,
        phoneCountryCode: user.phoneCountryCode,
        phoneNumber: user.phoneNumber,
      },
      items,
      total,
      page,
      pageSize,
    };
  }

  /**
   * `"<type>:<id>" -> title` for every tag recommended anywhere on this page.
   *
   * Keyed by type AND id because the six catalogue tables have independent id
   * spaces — aarti and bhajan even share `audio_items`, so an id alone cannot
   * identify a row.
   */
  private async resolveTitles(
    rows: readonly AdminChatMessageRow[]
  ): Promise<Map<string, string>> {
    const tags = rows.flatMap((row) =>
      row.role === "bot" ? parseAnswer(row.content).contentIds : []
    );
    if (tags.length === 0) return new Map();

    const contentRows = await this.content.findByTypeAndIds(resolveContentIds(tags));
    return new Map(
      contentRows.map((row: ContentRow) => [`${row.type}:${row.id}`, row.title])
    );
  }

  private toTranscriptSession(
    session: AdminChatSessionRow,
    tail: readonly AdminChatMessageRow[],
    messageCount: number,
    titles: Map<string, string>
  ): TranscriptSession {
    return {
      id: session.id,
      agentId: session.agentId,
      variant: variantForAgent(session.agentId),
      personaSlug: session.personaSlug,
      createdAt: session.createdAt.toISOString(),
      messageCount,
      // Compared against the COUNT, not against the cap: a session holding
      // exactly `messageCap` messages is complete, and flagging it as truncated
      // would send an editor hunting for turns that do not exist.
      truncated: messageCount > tail.length,
      // The repository hands back newest-first (the tail); a transcript reads
      // top-to-bottom in the order it was written.
      messages: [...tail]
        .reverse()
        .map((row) => this.toTranscriptMessage(row, titles)),
    };
  }

  private toTranscriptMessage(
    row: AdminChatMessageRow,
    titles: Map<string, string>
  ): TranscriptMessage {
    // The SAME unwrap the mobile history goes through, so the CMS shows the
    // text the user actually saw. A user turn has no envelope — it is our own
    // row, never round-tripped through the agent.
    const parsed = row.role === "bot" ? parseAnswer(row.content) : proseOnly(row.content);
    return {
      id: row.id,
      role: row.role,
      message: parsed.replyText,
      confidence: parsed.confidence,
      recommendations: parsed.contentIds.map((tag) => {
        const placed = lookupContentTag(tag);
        return {
          tag: placed.tag,
          type: placed.type,
          // Null covers both misses — an unmapped tag and a mapped one whose
          // row is gone or deactivated. The CMS shows the bare tag for both.
          title:
            placed.type === null || placed.id === null
              ? null
              : (titles.get(`${placed.type}:${placed.id}`) ?? null),
        };
      }),
      createdAt: row.createdAt.toISOString(),
    };
  }
}
