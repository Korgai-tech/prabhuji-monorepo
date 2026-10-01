import type { PrismaClient } from "@prisma/client";

/**
 * Kuldevta module repository — the ONLY place `@prisma/client` is reached
 * for this module (arch-boundaries.json enforces it; the service stays
 * Prisma-free, which is exactly why `identifyKuldevta` takes an explicit
 * `saveAssignment` dependency instead of importing this file directly).
 *
 * `saveAssignment` upserts on `userId` (the model's primary key) so a family
 * re-running the identify flow (e.g. after correcting an answer) overwrites
 * the previous assignment rather than erroring on a duplicate key.
 *
 * The UPDATE branch must also clear `ragflowSessionId`. RAGFlow holds the
 * conversation server-side and `callPersonaAgent` sends the deity identity in
 * the Begin `inputs` ONLY on the first turn (when there is no session id) —
 * so a family re-assigned from, say, `khandoba` to `nagnechi` while keeping
 * the old session would go on being answered by the OLD deity on every later
 * turn, permanently and with no error anywhere. Nulling the session forces
 * the next chat turn to open a fresh RAGFlow session seeded with the NEW
 * deity. `assignedAt` is bumped for the same reason it exists: the row now
 * describes a different assignment made at a different time.
 */
export function makeKuldevtaRepository(prisma: PrismaClient) {
  return {
    async saveAssignment(row: {
      userId: string;
      kuldevtaSlug: string;
      assignmentTier: string;
      matchedOn: string[];
      answers: unknown;
      profile: unknown;
    }): Promise<void> {
      const data = {
        kuldevtaSlug: row.kuldevtaSlug,
        assignmentTier: row.assignmentTier,
        matchedOn: row.matchedOn,
        answers: row.answers as object,
        profile: row.profile as object,
      };
      await prisma.userKuldevta.upsert({
        where: { userId: row.userId },
        create: { userId: row.userId, ...data },
        update: { ...data, ragflowSessionId: null, assignedAt: new Date() },
      });
    },

    async findAssignment(userId: string) {
      return prisma.userKuldevta.findUnique({ where: { userId } });
    },

    /**
     * The persisted RAGFlow session id for this user's persona chat, or
     * `null` if the family has never had a turn yet (no assignment, or an
     * assignment that predates the first chat message).
     */
    async getSessionId(userId: string): Promise<string | null> {
      const row = await prisma.userKuldevta.findUnique({
        where: { userId },
        select: { ragflowSessionId: true },
      });
      return row?.ragflowSessionId ?? null;
    },

    /**
     * Persists the RAGFlow session id after the FIRST successful persona
     * turn (spec §9: "First call creates the session ... The session id is
     * persisted on `UserKuldevta`"). Assumes a `UserKuldevta` row already
     * exists — the persona chat is only reachable once a deity has been
     * assigned via `/kuldevta/identify`.
     */
    async saveSessionId(userId: string, sessionId: string): Promise<void> {
      await prisma.userKuldevta.update({
        where: { userId },
        data: { ragflowSessionId: sessionId },
      });
    },
  };
}

export type KuldevtaRepository = ReturnType<typeof makeKuldevtaRepository>;
