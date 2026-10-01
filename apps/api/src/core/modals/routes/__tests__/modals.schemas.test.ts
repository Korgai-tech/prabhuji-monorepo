import { describe, expect, test } from "vitest";
import {
  ModalContentEntrySchema,
  ModalHookBody,
  ModalImpressionBody,
  ModalsNextQuery,
} from "../modals.schemas.js";

describe("ModalsNextQuery", () => {
  test("accepts an unsupported locale rather than rejecting it", () => {
    // Read validation is TOLERANT repo-wide: an app build shipping a ninth
    // language must degrade to a fallback, not lose the whole screen.
    expect(ModalsNextQuery.safeParse({ surface: "home", locale: "xx" }).success).toBe(true);
  });

  test("locale is optional", () => {
    expect(ModalsNextQuery.safeParse({ surface: "home" }).success).toBe(true);
  });

  test("surface is required", () => {
    expect(ModalsNextQuery.safeParse({ locale: "hi" }).success).toBe(false);
  });
});

describe("ModalHookBody", () => {
  const base = {
    modal_key: "status_intro",
    action: "arm",
    trigger_source: "post_outcome",
    user_id: "01a01482-6685-7233-8000-000000000001",
    task_id: "campaign-delivery-1",
    origin: "event",
  };

  test("accepts a minimal arm", () => {
    expect(ModalHookBody.safeParse(base).success).toBe(true);
  });

  test("accepts a null source_event_name from a cron exit", () => {
    const parsed = ModalHookBody.safeParse({ ...base, origin: "cron", source_event_name: null });
    expect(parsed.success).toBe(true);
  });

  // Loose: a field the campaign console adds tomorrow must not 400 a webhook
  // that would otherwise apply cleanly.
  test("carries unknown fields rather than rejecting them", () => {
    expect(ModalHookBody.safeParse({ ...base, some_future_field: 1 }).success).toBe(true);
  });

  test("rejects an unknown action", () => {
    expect(ModalHookBody.safeParse({ ...base, action: "delete" }).success).toBe(false);
  });

  // TAM-261: the platform's live API_CALL envelope merges only user_id,
  // campaign_id and campaign_message_id — no task_id. Requiring it 400'd every
  // prod delivery from 2026-09-15 on.
  test("accepts the platform envelope with no task_id", () => {
    const { task_id, ...withoutTaskId } = base;
    void task_id;
    const parsed = ModalHookBody.safeParse({ ...withoutTaskId, campaign_id: 12, campaign_message_id: 44 });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.task_id).toBeUndefined();
      expect(parsed.data.campaign_message_id).toBe(44);
    }
  });

  test("defaults origin to event when a v1 dispatch omits it", () => {
    // The destructured `origin` is intentionally discarded — this is what
    // produces `withoutOrigin` — so reference it to satisfy
    // `@typescript-eslint/no-unused-vars` without an eslint-disable comment
    // (none exist elsewhere in this codebase).
    const { origin, ...withoutOrigin } = base;
    void origin;
    const parsed = ModalHookBody.safeParse(withoutOrigin);
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.origin).toBe("event");
  });

  // Blocker 3a of the TAM-174 fix wave: every OTHER wire field is snake_case,
  // so a console author's `cta_text` typo must never 400 the whole webhook —
  // it must just make that one locale entry unusable, decided at runtime by
  // the service's intake check, not by Zod.
  test("a snake_case typo inside a content entry does not 400 the webhook", () => {
    const parsed = ModalHookBody.safeParse({
      ...base,
      content: { hi: { title: "t", cta_text: "c", cta_deeplink: "prabhuji://x" } },
    });
    expect(parsed.success).toBe(true);
  });

  test("a content entry missing required fields does not 400 the webhook", () => {
    const parsed = ModalHookBody.safeParse({
      ...base,
      content: { hi: { title: "t" } },
    });
    expect(parsed.success).toBe(true);
  });

  // The scheme is NOT enforced here either, for the identical reason — an
  // out-of-scheme `ctaDeeplink` must fail the shared usability check at
  // runtime (Blocker 3a + the ctaDeeplink scheme fix), not 400 the hook.
  test("an out-of-scheme ctaDeeplink inside content does not 400 the webhook", () => {
    const parsed = ModalHookBody.safeParse({
      ...base,
      content: { hi: { title: "t", ctaText: "c", ctaDeeplink: "javascript:alert(1)" } },
    });
    expect(parsed.success).toBe(true);
  });
});

describe("ModalContentEntrySchema — the served response shape", () => {
  const valid = { title: "t", ctaText: "c", ctaDeeplink: "prabhuji://status" };

  test("accepts the app's own custom scheme", () => {
    expect(ModalContentEntrySchema.safeParse(valid).success).toBe(true);
  });

  test("accepts https", () => {
    expect(
      ModalContentEntrySchema.safeParse({ ...valid, ctaDeeplink: "https://prabhuji.app/status" })
        .success
    ).toBe(true);
  });

  // Whoever holds `MODAL_HOOK_KEY` decides what a served CTA opens — this is
  // the fail-closed gate for any scheme outside the two the app trusts.
  test("rejects an untrusted scheme", () => {
    expect(
      ModalContentEntrySchema.safeParse({ ...valid, ctaDeeplink: "javascript:alert(1)" }).success
    ).toBe(false);
  });

  test("rejects a bare path with no scheme at all", () => {
    expect(ModalContentEntrySchema.safeParse({ ...valid, ctaDeeplink: "/status" }).success).toBe(
      false
    );
  });
});

describe("ModalImpressionBody", () => {
  test("accepts a dismissal with a method", () => {
    const parsed = ModalImpressionBody.safeParse({
      modalKey: "status_intro",
      triggerSource: "post_outcome",
      action: "dismissed",
      dismissMethod: "cross",
      showNumber: 1,
    });
    expect(parsed.success).toBe(true);
  });

  test("rejects an unknown dismiss method", () => {
    const parsed = ModalImpressionBody.safeParse({
      modalKey: "status_intro",
      triggerSource: "post_outcome",
      action: "dismissed",
      dismissMethod: "swipe",
      showNumber: 1,
    });
    expect(parsed.success).toBe(false);
  });

  // The idempotency key the service's CAS is keyed on — required, and must be
  // a positive show number, not merely present.
  test("showNumber is required", () => {
    const parsed = ModalImpressionBody.safeParse({
      modalKey: "status_intro",
      triggerSource: "post_outcome",
      action: "viewed",
    });
    expect(parsed.success).toBe(false);
  });

  test("rejects a zero or negative showNumber", () => {
    expect(
      ModalImpressionBody.safeParse({
        modalKey: "status_intro",
        triggerSource: "post_outcome",
        action: "viewed",
        showNumber: 0,
      }).success
    ).toBe(false);
  });

  // TAM-174 prod bug: `dismissMethod` MUST accept both shapes, not just the
  // absent one. The OpenAPI-generated Dart model's `toJson()`
  // (apps/mobile/lib/api/generated/models/modal_impression_body.dart) never
  // omits the key — its optional-field template always emits it, with an
  // explicit `null` when the field is unset. A bare `.optional()` (no
  // `.nullable()`) accepts ONLY the omitted-key shape below and 400s the
  // real mobile client on every `viewed`/`cta_clicked` impression, which is
  // exactly what shipped to prod: the client swallows the 4xx by design, so
  // `showCount` silently never advanced.
  test("accepts an absent dismissMethod", () => {
    const parsed = ModalImpressionBody.safeParse({
      modalKey: "status_intro",
      triggerSource: "post_outcome",
      action: "viewed",
      showNumber: 1,
    });
    expect(parsed.success).toBe(true);
  });

  test("accepts an explicit-null dismissMethod, the shape the generated Dart client always sends", () => {
    const parsed = ModalImpressionBody.safeParse({
      modalKey: "status_intro",
      triggerSource: "post_outcome",
      action: "viewed",
      dismissMethod: null,
      showNumber: 1,
    });
    expect(parsed.success).toBe(true);
  });
});
