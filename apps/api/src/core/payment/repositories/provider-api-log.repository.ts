import type { Prisma } from "@prisma/client";
import { getPrisma } from "@api/shared/database";

/**
 * One outbound gateway exchange, as persisted.
 *
 * `requestBody` / `responseBody` / `requestHeaders` arrive ALREADY REDACTED — the
 * caller passes them through `redactPayload` and blanks secret header values.
 * Nothing in this module writes a payer handle or a credential at rest, and this
 * table is the one that would most easily become the exception.
 */
export interface InsertProviderApiLogInput {
  provider: string;
  operation: string;
  httpMethod?: string | null;
  requestUrl?: string | null;
  requestHeaders?: unknown;
  requestBody?: unknown;
  responseStatus?: number | null;
  responseBody?: unknown;
  providerStatus?: string | null;
  providerMessage?: string | null;
  providerResponseCode?: string | null;
  referenceId?: string | null;
  providerTransactionId?: string | null;
  /** The gateway's own correlation id — Cashfree's `x-request-id`. */
  providerRequestId?: string | null;
  userId?: string | null;
  mandateId?: string | null;
  attempt?: number;
  durationMs?: number | null;
  result?: "success" | "failure" | "timeout";
  errorMessage?: string | null;
}

/**
 * The seam the HTTP clients depend on, so a test can inject a writer that throws
 * and prove an audit failure does not fail the payment call.
 */
export interface ProviderApiLogWriter {
  insert(input: InsertProviderApiLogInput): Promise<void>;
}

/**
 * The integration ledger — every request we send a gateway and whatever came
 * back.
 *
 * Append-only, and nothing reads it on a hot path: it exists to be answerable
 * months later by a human with psql, which is precisely what was missing when a
 * wrong endpoint constant silently stopped every recurring debit in production
 * and the only evidence was a `failure_message` column and CloudWatch retention.
 *
 * This class does NOT swallow write failures — repositories report, they do not
 * set policy. The best-effort discipline lives at the call site in the HTTP
 * clients, where the reasoning for it (a rethrow would masquerade as a transport
 * failure and re-drive the retry loop) belongs.
 */
export class ProviderApiLogRepository implements ProviderApiLogWriter {
  async insert(input: InsertProviderApiLogInput): Promise<void> {
    await getPrisma().paymentProviderApiLog.create({
      data: {
        provider: input.provider,
        direction: "outbound",
        operation: input.operation,
        httpMethod: input.httpMethod ?? null,
        requestUrl: input.requestUrl ?? null,
        requestHeaders: asJson(input.requestHeaders),
        requestBody: asJson(input.requestBody),
        responseStatus: input.responseStatus ?? null,
        responseBody: asJson(input.responseBody),
        providerStatus: input.providerStatus ?? null,
        providerMessage: input.providerMessage ?? null,
        providerResponseCode: input.providerResponseCode ?? null,
        referenceId: input.referenceId ?? null,
        providerTransactionId: input.providerTransactionId ?? null,
        providerRequestId: input.providerRequestId ?? null,
        userId: input.userId ?? null,
        mandateId: input.mandateId ?? null,
        attempt: input.attempt ?? 1,
        durationMs: input.durationMs ?? null,
        result: input.result ?? "success",
        errorMessage: input.errorMessage ?? null,
      },
    });
  }
}

/**
 * Coerce an already-redacted payload into something a `Json?` column accepts.
 *
 * `undefined` must become `Prisma.DbNull`-free absence rather than JSON `null`,
 * so an omitted body reads as "we did not send one" instead of "we sent null".
 */
function asJson(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined || value === null) return undefined;
  return value;
}
