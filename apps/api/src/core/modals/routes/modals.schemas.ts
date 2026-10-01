import { z } from "zod";
import { localeQuery } from "@api/shared/schemas/locale";
import { CTA_DEEPLINK_PATTERN } from "@api/core/modals/types";

/**
 * Zod schemas for the generalized modal module (TAM-174).
 *
 * The hook body is snake_case because it is the campaign platform's wire shape,
 * not ours; the two app-facing routes are camelCase like every other route here.
 */

/**
 * `ctaDeeplink`, echoed straight to a client `launchUrl`. Constrained to the
 * app's own custom scheme or a real `https://` link — whoever holds
 * `MODAL_HOOK_KEY` decides what gets opened, so this Zod check must not be the
 * ONLY control (rotate the key on any suspected leak), but a rogue scheme
 * (`javascript:`, `intent:`, `file://`, …) must still never reach the app.
 * `CTA_DEEPLINK_PATTERN` is shared with `isUsableContentEntry` in `types.ts`
 * so the allowed schemes have exactly one definition.
 */
const CtaDeeplinkSchema = z
  .string()
  .regex(CTA_DEEPLINK_PATTERN, "ctaDeeplink must start with prabhuji:// or https://");

/** The fully-resolved locale entry as WE serve it — every field required. */
export const ModalContentEntrySchema = z
  .object({
    title: z.string(),
    body: z.string().optional(),
    imageUrl: z.string().optional(),
    ctaText: z.string(),
    ctaDeeplink: CtaDeeplinkSchema,
  })
  .meta({ id: "ModalContentEntry" });

/**
 * One locale's copy AS IT ARRIVES ON THE WEBHOOK — every field optional and
 * `.looseObject()`, unlike `ModalContentEntrySchema` above. Every other wire
 * field on `ModalHookBody` is snake_case, so a console author's `cta_text`
 * typo for `ctaText` must never 400 the whole webhook and silently lose the
 * arm (dispatch treats a 4xx as PERMANENT). A missing/misnamed field here is
 * therefore not a Zod validation error; it just makes this one locale entry
 * unusable, which the shared `isUsableContentEntry` check decides at intake
 * (refusing the ARM with a 200 `{applied:false, reason:"unservable"}`) and
 * again at serve (`resolveContent` skipping the entry). For the same reason
 * `ctaDeeplink` is NOT regex-constrained here — an out-of-scheme link must
 * not 400 the hook either, it must fail the SAME usability check instead.
 * Deliberately carries no `.meta({ id })` — see `ModalHookBody` below for why.
 */
const ModalHookContentEntry = z.looseObject({
  title: z.string().optional(),
  body: z.string().optional(),
  imageUrl: z.string().optional(),
  ctaText: z.string().optional(),
  ctaDeeplink: z.string().optional(),
});

/**
 * The campaign webhook body.
 *
 * `.loose()` and permissive by design: a vendor-side field addition must never
 * 400 a webhook, because dispatch treats a 4xx as PERMANENT — one attempt, no
 * retry, the arm silently lost.
 *
 * Deliberately carries NO `.meta({ id })`: `@fastify/swagger`'s zod registry
 * publishes every named schema into `components.schemas` regardless of
 * whether the route that uses it is `hide: true`, so a name here would leak
 * the webhook shape back into both emitted documents — and from there into
 * the Dart-generated APK models — defeating the very reason the route is
 * hidden. `ProviderCallbackBody` (payment) is unnamed for the identical
 * reason; verified empirically while wiring this route (TAM-174).
 */
export const ModalHookBody = z
  .looseObject({
    modal_key: z.string().min(1).max(64),
    action: z.enum(["arm", "halt"]),
    trigger_source: z.string().min(1).max(64),
    surface: z.string().min(1).max(64).optional(),
    max_lifetime: z.coerce.number().int().positive().max(100).optional(),
    max_per_day: z.coerce.number().int().positive().max(100).optional(),
    content: z.record(z.string(), ModalHookContentEntry).optional(),

    // `z.uuid()`, the Zod 4 top-level form this repo uses everywhere — NOT the
    // deprecated `z.string().uuid()`. It accepts UUIDv7, which is what
    // `User.id @default(uuid(7))` produces.
    user_id: z.uuid(),
    // Optional (TAM-261): the platform's live API_CALL envelope merges only
    // `user_id`, `campaign_id` and `campaign_message_id` — requiring this
    // 400'd every prod delivery from 2026-09-15. When absent the controller
    // mints a per-delivery key; see `resolveTaskId`.
    task_id: z.string().min(1).max(128).optional(),
    // Merged by the platform on every API_CALL. Only feeds the derived
    // `task_id`, so a ledger row can still be traced to its message.
    campaign_message_id: z.coerce.number().int().positive().optional(),
    // Defaulted, not required: a dispatch written before envelope version 2
    // carries no origin, and treating that as a cron exit would be wrong in the
    // dangerous direction.
    origin: z.enum(["event", "cron"]).default("event"),
    source_event_name: z.string().min(1).nullable().optional(),
    audience_id: z.coerce.number().int().positive().optional(),
    audience_name: z.string().min(1).max(128).optional(),
    campaign_id: z.coerce.number().int().positive().optional(),
    occurred_at: z.string().min(1).optional(),
  });
export type ModalHookBodyInput = z.infer<typeof ModalHookBody>;

export const ModalsNextQuery = z
  .object({ surface: z.string().min(1).max(64) })
  .extend(localeQuery.shape);
export type ModalsNextQueryInput = z.infer<typeof ModalsNextQuery>;

export const ModalImpressionBody = z
  .object({
    modalKey: z.string().min(1).max(64),
    triggerSource: z.string().min(1).max(64),
    action: z.enum(["viewed", "cta_clicked", "dismissed"]),
    // `.nullable().optional()`, not bare `.optional()` — see the identical note
    // on `status.schemas.ts`. The OpenAPI-generated Dart model's `toJson()`
    // always emits an explicit `dismissMethod: null` key when the field is
    // unset (it never omits the key), because the generator's optional-field
    // template writes `null` in the `else` branch rather than skipping the
    // key entirely. A bare `.optional()` only accepts an ABSENT key, so every
    // `viewed`/`cta_clicked` impression from the real mobile client — which
    // never has a `dismissMethod` — 400'd here, and the client swallows 4xxs
    // by design: `showCount` silently never advanced (TAM-174 prod bug).
    // `null` and `undefined` are treated equivalently below (`?? null`).
    dismissMethod: z.enum(["cross", "back", "outside_tap"]).nullable().optional(),
    // The `showNumber` the client was actually served on `GET /modals/next`
    // (`ServableModal.showNumber`), echoed back rather than re-derived from a
    // fresh server-side read. This is what makes the CAS an idempotency key
    // instead of a same-instant-only race guard: a fresh read is current BY
    // DEFINITION, so it always advances — which is why a `viewed` retried a
    // moment later (network blip, a double widget rebuild) used to count
    // twice even outside a true concurrent race. Pinning the number the
    // client was told makes a second report of the SAME show fail the
    // compare-and-swap no matter when it arrives.
    //
    // `.max(10_000)` is NOT a business rule (`maxLifetime` already caps real
    // shows in the single digits) — it guards `modal_user_states.show_count`
    // and `modal_impressions.show_number`, both Postgres `int4`. Without it a
    // value like 2_999_999_999 reaches `advanceLedger`/`appendImpression` and
    // Prisma throws a `ConversionError` that is not an `AppError`, surfacing
    // as an unhandled 500 on an authenticated route instead of a 400.
    showNumber: z.number().int().positive().max(10_000),
  })
  .meta({ id: "ModalImpressionBody" });
export type ModalImpressionBodyInput = z.infer<typeof ModalImpressionBody>;

export const ServableModalSchema = z
  .object({
    key: z.string(),
    triggerSource: z.string(),
    showNumber: z.number().int(),
    lastOutcomeModule: z.string().nullable(),
    localeServed: z.string(),
    content: ModalContentEntrySchema,
  })
  .meta({ id: "ServableModal" });

export const ModalsNextResponse = z
  .object({
    success: z.literal(true),
    message: z.string(),
    // Null is the ordinary answer on a Home open: capped, halted, or nothing
    // armed. Never a 404.
    data: z.object({ modal: ServableModalSchema.nullable() }),
  })
  .meta({ id: "ModalsNextResponse" });

export const ModalImpressionResponse = z
  .object({
    success: z.literal(true),
    message: z.string(),
    data: z.object({ counted: z.boolean() }),
  })
  .meta({ id: "ModalImpressionResponse" });

export const ModalHookResponse = z.object({
  success: z.literal(true),
  message: z.string(),
  data: z.object({ applied: z.boolean(), reason: z.string() }),
});

export const ErrorEnvelope = z
  .object({
    success: z.literal(false),
    message: z.string(),
    data: z.null(),
    errorCode: z.string().optional(),
  })
  .meta({ id: "ModalsErrorEnvelope" });
