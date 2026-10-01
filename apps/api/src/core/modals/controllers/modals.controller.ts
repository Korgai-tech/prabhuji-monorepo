import { randomUUID, timingSafeEqual } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import { sendSuccess } from "@api/shared/response";
import { AppError } from "@api/shared/errors";
import { loadEnv } from "@api/shared/config";
import { createModuleLogger } from "@api/shared/logs";
import type { ModalsService } from "@api/core/modals/services";
import type {
  ModalHookBodyInput,
  ModalImpressionBodyInput,
  ModalsNextQueryInput,
} from "@api/core/modals/routes/modals.schemas";

const log = createModuleLogger("modals:controller");

/**
 * Constant-time compare that also tolerates a length mismatch.
 *
 * `timingSafeEqual` THROWS on differing lengths, which both leaks the length
 * and turns a wrong key into a 500 instead of a 401.
 */
function secretMatches(presented: string, expected: string): boolean {
  const a = Buffer.from(presented);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export class ModalsController {
  constructor(private readonly service: ModalsService) {}

  hook = async (
    req: FastifyRequest<{ Body: ModalHookBodyInput }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const expected = loadEnv().MODAL_HOOK_KEY;
    const presented = req.headers["x-modal-hook-key"];
    if (typeof presented !== "string" || !secretMatches(presented, expected)) {
      log.warn("modal hook rejected: bad or missing key");
      throw new AppError("Unauthorized", 401, "UNAUTHORIZED");
    }

    const body = req.body;
    const outcome = await this.service.handleHook({
      taskId: resolveTaskId(body),
      action: body.action,
      origin: body.origin,
      userId: body.user_id,
      modalKey: body.modal_key,
      triggerSource: body.trigger_source,
      surface: body.surface ?? null,
      content: body.content ?? null,
      maxLifetime: body.max_lifetime ?? null,
      maxPerDay: body.max_per_day ?? null,
      sourceEventName: body.source_event_name ?? null,
      audienceId: body.audience_id ?? null,
      audienceName: body.audience_name ?? null,
      campaignId: body.campaign_id ?? null,
      // An unparseable or absent occurred_at falls back to now rather than
      // failing: the arm is worth more than a perfect timestamp.
      occurredAt: parseOccurredAt(body.occurred_at),
    });

    // Always 200 for a payload we understood, applied or not — see the service.
    return sendSuccess(reply, outcome, "Modal hook processed");
  };

  next = async (
    req: FastifyRequest<{ Querystring: ModalsNextQueryInput }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const userId = this.requireUserId(req);
    const modal = await this.service.next(userId, req.query.surface, req.query.locale);
    return sendSuccess(reply, { modal }, modal ? "Modal available" : "No modal");
  };

  impression = async (
    req: FastifyRequest<{ Body: ModalImpressionBodyInput }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const userId = this.requireUserId(req);
    const result = await this.service.recordImpression({
      userId,
      modalKey: req.body.modalKey,
      triggerSource: req.body.triggerSource,
      action: req.body.action,
      dismissMethod: req.body.dismissMethod ?? null,
      showNumber: req.body.showNumber,
    });
    return sendSuccess(reply, result, "Impression recorded");
  };

  private requireUserId(req: FastifyRequest): string {
    if (!req.user) throw new AppError("Unauthorized", 401, "UNAUTHORIZED");
    return req.user.id;
  }
}

function parseOccurredAt(raw: string | undefined): Date {
  if (!raw) return new Date();
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

/**
 * The idempotency key for one delivery (TAM-261).
 *
 * A `task_id` the caller sends is used verbatim. The platform's live API_CALL
 * envelope carries none, so one is minted PER DELIVERY — deliberately not a
 * deterministic `(campaign_message_id, user_id)` key, which would dedupe every
 * later re-arm from the same message (each new `post_outcome` a user earns)
 * forever. No dedupe is safe here because every hook effect is idempotent: a
 * re-arm refreshes the offer without rewinding the ledger, and halt/clear are
 * no-ops the second time. The message id and user stay in the key so a ledger
 * row is still traceable.
 */
export function resolveTaskId(
  body: Pick<ModalHookBodyInput, "task_id" | "campaign_message_id" | "user_id">
): string {
  if (body.task_id) return body.task_id;
  return `derived:cm-${body.campaign_message_id ?? "none"}:${body.user_id}:${randomUUID()}`;
}
