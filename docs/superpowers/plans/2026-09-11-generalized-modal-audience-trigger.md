# Generalized Modal Arming Pipeline — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a generalized in-app modal whose eligibility is decided by the shared audience-campaign platform and delivered to `apps/api` as a campaign webhook, with the Status intro modal's post-outcome trigger as its first tenant.

**Architecture:** An outcome event travels asynchronously through the krutyug platform (collector → aggregator → audience evaluator → campaign dispatcher) and returns to prabhuji as one HTTP call that *arms* a modal for a user. A second campaign, on the audience exit, *halts* it permanently. Prabhuji owns the frequency caps in its own Postgres and answers a separate synchronous read (`GET /modals/next`) on app open. The two halves never touch at request time.

**Tech Stack:** Fastify 5 + Zod + Prisma (Postgres) + Vitest on the prabhuji side; TypeScript + Zod + Prisma + BullMQ on the krutyug side.

**Spec:** `specs/TAM-174-generalized-modal-audience-trigger.md`
**Architecture doc:** https://claude.ai/code/artifact/acd69512-0e15-4f48-aa56-ab63227a3108

## Global Constraints

- **Two repos.** Phase 1 (Tasks 1–3) is `~/Developer/krutyug/monorepo-saas`, `services/audience-campaign`. Phases 2–5 (Tasks 4–14) are `~/Developer/krutyug/prabhuji-monorepo`. Phase 1 ships first and alone — it changes nothing observable until a campaign uses the new fields.
- **Branch (prabhuji):** `TAM-174-generalized-modal-audience-trigger`, already created off `main`. Commits: `type(scope): description [TAM-174]`.
- **`apps/api` layering** is CI-enforced (`pnpm check:arch-boundaries`): Route → Controller → Service → Repository. `@prisma/client` is imported **only** inside `repositories/`. Modules never import each other's files.
- **TS strict, no `any`** (use `unknown`), `import type` for type-only imports, no floating promises, never `console.log` — use `createModuleLogger("modals:<sublayer>")`.
- **`@typescript-eslint/require-await` is enforced as an ERROR.** An `async` function with no `await` in its body fails lint. Test fakes and stubs whose bodies are synchronous must be plain arrows returning `Promise.resolve(...)`, never `async () => value`.
- **A `hide: true` route's body schema must NOT carry `.meta({ id })`.** `hide` hides the PATH; a named Zod schema still lands in `components.schemas` of both emitted documents, and the Dart generator emits a model per schema there. Naming a private webhook's body ships its shape inside the APK. Public, app-facing schemas SHOULD be named.
- **Responses** go through `sendSuccess` / `sendError` only → `{success, message, data}`. Errors are `AppError` / `ValidationError` from `@api/shared/errors`.
- **Public read endpoints take `locale`, never `language`**, composed from `shared/schemas/locale.ts` via `.extend(localeQuery.shape)`. Read validation is TOLERANT — an unsupported code falls back, never 400s.
- **IST civil dates** are `YYYY-MM-DD` TEXT in `Asia/Kolkata`, never a UTC timestamp.
- **`core/modals` must never read `UserStatusProfile`.** Having a name and photo saved is NOT the halt condition — only an actual share is. Reading it would break the stated product edge case.
- **The hook route answers 2xx for anything it understood, duplicates included.** A 4xx is a permanent failure upstream: one attempt, no retry, the arm is lost. 5xx is reserved for genuine transient failure.
- **After any route/schema change**, regenerate downstream artifacts IN ORDER and commit them: `pnpm nx run api:openapi` → `pnpm nx run api-client:generate` → `pnpm nx run mobile:generate`.

---

# Phase 1 — `services/audience-campaign` (monorepo-saas)

All Phase 1 work is in `~/Developer/krutyug/monorepo-saas/services/audience-campaign`.
Run tests with `pnpm --filter @svc/audience-campaign test` and typecheck with
`pnpm --filter @svc/audience-campaign typecheck`.

**Why this phase exists.** `withIdentity` in `delivery/api-call.ts` today merges
exactly three fields (`user_id`, `campaign_id`, `campaign_message_id`), and
`contact.ts` whitelists only `phone_number` / `device_token` off the triggering
event. So the event's *name* reaches no channel and there is no per-send id to
deduplicate on. Without this, `last_outcome_module` is unobtainable and
at-least-once dispatch cannot be made safe.

---

### Task 1: Carry the transition context into the dispatch envelope

**Files:**
- Modify: `src/modules/campaigns/dispatch.ts`
- Modify: `src/modules/campaigns/campaign.repository.ts` (`applyPlan`, ~line 97 and the `sendFrom` call ~line 152)
- Modify: `src/modules/campaigns/campaign.processor.ts` (`commitPlan` ~line 141, its call site ~line 123)
- Test: `src/modules/campaigns/dispatch.test.ts` (exists)

**Interfaces:**
- Consumes: `AudienceUpdate` from `../audiences/update.ts` — already carries `audience_id`, `audience_name`, `origin`, `source_event_name`, `occurred_at`.
- Produces:
  - `export type TransitionContext = { audienceId: number; audienceName: string; origin: 'event' | 'cron'; sourceEventName: string | null; occurredAt: string }`
  - `sendFrom(input: { tenantSlug, userId, deliveryId, send, transition? })`
  - `commitPlan(tenantSlug, userId, planned, deps, transition?)`
  - `applyPlan(input: { tenantSlug, userId, plan, transition? })`
  - `CAMPAIGN_DISPATCH_VERSION = '2'`

- [ ] **Step 1: Write the failing test**

Append to `src/modules/campaigns/dispatch.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { parseCampaignDispatch, sendFrom, type TransitionContext } from './dispatch.ts';

const TRANSITION: TransitionContext = {
  audienceId: 42,
  audienceName: 'prabhuji-status-intro',
  origin: 'event',
  sourceEventName: 'set_wallpaper_result',
  occurredAt: '2026-09-11T06:35:00.000Z',
};

const SEND = {
  campaignId: 12,
  campaignMessageId: 44,
  channel: 'API_CALL' as const,
  metadata: { url: 'https://example.test/hook', method: 'POST' },
  sendAt: null,
};

describe('transition context on a dispatch', () => {
  it('carries every transition field when one is supplied', () => {
    const dispatch = sendFrom({
      tenantSlug: 'prabhuji',
      userId: 'u-1',
      deliveryId: 91823n,
      send: SEND,
      transition: TRANSITION,
    });

    expect(dispatch.envelope_version).toBe('2');
    expect(dispatch.audience_id).toBe(42);
    expect(dispatch.audience_name).toBe('prabhuji-status-intro');
    expect(dispatch.origin).toBe('event');
    expect(dispatch.source_event_name).toBe('set_wallpaper_result');
    expect(dispatch.occurred_at).toBe('2026-09-11T06:35:00.000Z');
  });

  it('omits them entirely when no transition is supplied', () => {
    const dispatch = sendFrom({
      tenantSlug: 'prabhuji',
      userId: 'u-1',
      deliveryId: 91823n,
      send: SEND,
    });

    expect(dispatch.audience_id).toBeUndefined();
    expect(dispatch.origin).toBeUndefined();
  });

  // The rollout case: rows written by the PREVIOUS version are still in the
  // outbox and still in BullMQ when this deploys. If the parser required the
  // new fields, every in-flight dispatch would dead-letter.
  it('parses a v1 envelope that predates these fields', () => {
    const result = parseCampaignDispatch({
      envelope_version: '1',
      tenant_id: 'prabhuji',
      op: 'send',
      task_id: 'campaign-delivery-1',
      user_id: 'u-1',
      channel: 'API_CALL',
      campaign_id: 12,
      campaign_message_id: 44,
      send_at: null,
      params: { url: 'https://example.test/hook', method: 'POST' },
    });

    expect(result.ok).toBe(true);
  });

  it('parses a v2 envelope with a cron origin and a null source event', () => {
    const result = parseCampaignDispatch({
      envelope_version: '2',
      tenant_id: 'prabhuji',
      op: 'send',
      task_id: 'campaign-delivery-2',
      user_id: 'u-1',
      channel: 'API_CALL',
      campaign_id: 12,
      campaign_message_id: 44,
      send_at: null,
      params: { url: 'https://example.test/hook', method: 'POST' },
      audience_id: 42,
      audience_name: 'prabhuji-status-intro',
      origin: 'cron',
      source_event_name: null,
      occurred_at: '2026-09-11T06:35:00.000Z',
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.dispatch.origin).toBe('cron');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd ~/Developer/krutyug/monorepo-saas
pnpm --filter @svc/audience-campaign test -- dispatch.test.ts
```
Expected: FAIL — `TransitionContext` is not exported, `transition` is not a known property.

- [ ] **Step 3: Add the type and the envelope fields**

In `src/modules/campaigns/dispatch.ts`, bump the version and add the type:

```ts
/**
 * Moved to '2' when the transition context was added. Every new field is
 * OPTIONAL and the parser does not require them, so a v1 row still in the
 * outbox or in BullMQ at deploy time parses cleanly rather than dead-lettering.
 */
export const CAMPAIGN_DISPATCH_VERSION = '2';

/**
 * What the membership transition was, for channels whose recipient is a system
 * rather than a person.
 *
 * `contact.ts` whitelists per-USER fields off the event because a dispatch
 * crosses a message bus and unrelated event data must not ride along. This is
 * the other half: facts about the TRANSITION, which are not user data and which
 * a campaign author cannot know per recipient. Kept as one object rather than
 * five parameters so the plumbing from processor to channel stays one argument.
 */
export type TransitionContext = {
  audienceId: number;
  audienceName: string;
  /** `cron` is a time-to-exit sweep, which has no source event. */
  origin: 'event' | 'cron';
  sourceEventName: string | null;
  /** ISO. The transition's own time, not the moment the campaign acted. */
  occurredAt: string;
};
```

Add the optional fields to `CampaignDispatch`:

```ts
export type CampaignDispatch = {
  // …every existing field unchanged…
  /** The message's metadata, verbatim. */
  params?: Record<string, unknown>;
  /**
   * The transition context. Absent on a cancel, and absent on any dispatch
   * written before envelope version 2.
   */
  audience_id?: number;
  audience_name?: string;
  origin?: 'event' | 'cron';
  source_event_name?: string | null;
  occurred_at?: string;
};
```

Widen `sendFrom`:

```ts
export function sendFrom(input: {
  tenantSlug: string;
  userId: string;
  deliveryId: bigint;
  send: PlannedSend;
  transition?: TransitionContext;
}): CampaignDispatch {
  const { tenantSlug, userId, deliveryId, send, transition } = input;
  return {
    envelope_version: CAMPAIGN_DISPATCH_VERSION,
    tenant_id: tenantSlug,
    op: send.sendAt ? 'schedule' : 'send',
    task_id: taskIdFor(deliveryId),
    user_id: userId,
    channel: send.channel,
    campaign_id: send.campaignId,
    campaign_message_id: send.campaignMessageId,
    send_at: send.sendAt ? send.sendAt.toISOString() : null,
    params: send.metadata,
    // Spread rather than five `?? undefined` lines: an absent transition must
    // leave the keys OFF the object, not present-and-undefined, because the
    // payload is serialised to JSON and stored.
    ...(transition
      ? {
          audience_id: transition.audienceId,
          audience_name: transition.audienceName,
          origin: transition.origin,
          source_event_name: transition.sourceEventName,
          occurred_at: transition.occurredAt,
        }
      : {}),
  };
}
```

Add them to the parser schema (all optional):

```ts
const DispatchMessage = z
  .looseObject({
    // …every existing field unchanged…
    params: z.record(z.string(), z.unknown()).optional(),
    audience_id: z.number().int().positive().optional(),
    audience_name: z.string().min(1).optional(),
    origin: z.enum(['event', 'cron']).optional(),
    source_event_name: z.string().min(1).nullable().optional(),
    occurred_at: z.string().min(1).optional(),
  })
  .superRefine((value, ctx) => {
    // …unchanged — the new fields are deliberately NOT required here…
  });
```

- [ ] **Step 4: Run the dispatch test to verify it passes**

```bash
pnpm --filter @svc/audience-campaign test -- dispatch.test.ts
```
Expected: PASS.

- [ ] **Step 5: Thread the context from the processor to `sendFrom`**

`src/modules/campaigns/campaign.repository.ts` — widen `applyPlan` and pass it through:

```ts
async applyPlan(input: {
  tenantSlug: string;
  userId: string;
  plan: Plan;
  transition?: TransitionContext;
}): Promise<OutboxRow[]> {
  const { tenantSlug, userId, plan, transition } = input;
  // …unchanged…
```

and at the `sendFrom` call (~line 152):

```ts
payloads.push({
  userId,
  payload: asJson(sendFrom({ tenantSlug, userId, deliveryId: row.id, send, transition })),
});
```

Add the import: `import { cancelFrom, sendFrom, type TransitionContext } from './dispatch.ts';`

A cancel deliberately does not carry it — `cancelFrom` is untouched. A cancel addresses work by `task_id` alone, and repeating transition data there would invite acting on a stale copy.

`src/modules/campaigns/campaign.processor.ts` — widen `commitPlan`:

```ts
export async function commitPlan(
  tenantSlug: string,
  userId: string,
  planned: Plan,
  deps: CommitDeps,
  transition?: TransitionContext,
): Promise<number> {
  const outbox = await deps.repository.applyPlan({ tenantSlug, userId, plan: planned, transition });
  await deps.publisher.publish(outbox);
  return outbox.length;
}
```

and at its call site (~line 123), build the context from the update the processor already holds:

```ts
const dispatched = await commitPlan(tenant.slug, update.user_id, planned, deps, {
  audienceId: update.audience_id,
  audienceName: update.audience_name,
  origin: update.origin,
  sourceEventName: update.source_event_name,
  occurredAt: update.occurred_at,
});
```

`commitPlan`'s existing four-argument calls in `campaign.processor.test.ts` keep working — the parameter is optional.

- [ ] **Step 6: Run the full suite and typecheck**

```bash
pnpm --filter @svc/audience-campaign test
pnpm --filter @svc/audience-campaign typecheck
```
Expected: all green.

- [ ] **Step 7: Commit**

```bash
cd ~/Developer/krutyug/monorepo-saas
git add services/audience-campaign/src/modules/campaigns/
git commit -m "feat(audience-campaign): carry transition context on a dispatch

Envelope version 2. audience_id, audience_name, origin, source_event_name
and occurred_at are threaded from the AudienceUpdate the processor already
holds, through commitPlan and applyPlan, into sendFrom.

Every new field is OPTIONAL and the parser does not require them: rows
already in campaign_dispatch_outbox and jobs already in BullMQ at deploy
time carry none of them, and a required field would dead-letter every
in-flight dispatch on rollout."
```

---

### Task 2: Carry the transition context onto the delivery job

**Files:**
- Modify: `src/modules/delivery/queues.ts` (`DeliveryJobData`, ~line 52)
- Modify: `src/modules/delivery/scheduler.ts` (the `data:` block, ~line 74)
- Test: `src/modules/delivery/scheduler.test.ts` (exists)

**Interfaces:**
- Consumes: `CampaignDispatch` with the optional transition fields from Task 1.
- Produces: `DeliveryJobData` gains `audienceId?: number`, `audienceName?: string`, `origin?: 'event' | 'cron'`, `sourceEventName?: string | null`, `occurredAt?: string`.

- [ ] **Step 1: Write the failing test**

Append to `src/modules/delivery/scheduler.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { planDispatch } from './scheduler.ts';
import type { CampaignDispatch } from '../campaigns/dispatch.ts';

const BASE: CampaignDispatch = {
  envelope_version: '2',
  tenant_id: 'prabhuji',
  op: 'send',
  task_id: 'campaign-delivery-91823',
  user_id: 'u-1',
  channel: 'API_CALL',
  campaign_id: 12,
  campaign_message_id: 44,
  send_at: null,
  params: { url: 'https://example.test/hook', method: 'POST' },
};

describe('transition context reaches the job', () => {
  it('copies every transition field onto the job data', () => {
    const action = planDispatch(
      {
        ...BASE,
        audience_id: 42,
        audience_name: 'prabhuji-status-intro',
        origin: 'event',
        source_event_name: 'set_wallpaper_result',
        occurred_at: '2026-09-11T06:35:00.000Z',
      },
      new Date('2026-09-11T07:00:00.000Z'),
    );

    expect(action.kind).toBe('enqueue');
    if (action.kind !== 'enqueue') return;
    expect(action.data.audienceId).toBe(42);
    expect(action.data.audienceName).toBe('prabhuji-status-intro');
    expect(action.data.origin).toBe('event');
    expect(action.data.sourceEventName).toBe('set_wallpaper_result');
    expect(action.data.occurredAt).toBe('2026-09-11T06:35:00.000Z');
  });

  it('leaves them absent on a v1 dispatch', () => {
    const action = planDispatch(BASE, new Date('2026-09-11T07:00:00.000Z'));

    expect(action.kind).toBe('enqueue');
    if (action.kind !== 'enqueue') return;
    expect(action.data.audienceId).toBeUndefined();
    expect(action.data.sourceEventName).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @svc/audience-campaign test -- scheduler.test.ts
```
Expected: FAIL — `audienceId` is not a property of `DeliveryJobData`.

- [ ] **Step 3: Widen `DeliveryJobData`**

In `src/modules/delivery/queues.ts`:

```ts
export type DeliveryJobData = {
  /** The dispatch's `task_id`, which is also the BullMQ job id. */
  taskId: string;
  userId: string;
  channel: CampaignChannelName;
  campaignId: number;
  campaignMessageId: number;
  /** The campaign message's metadata, verbatim. Validated by the channel. */
  params: Record<string, unknown>;
  /**
   * The transition that caused this send. Optional because a job enqueued
   * before envelope version 2 carries none, and because only API_CALL has any
   * use for it — a human recipient has no interest in which audience they
   * joined.
   */
  audienceId?: number;
  audienceName?: string;
  origin?: 'event' | 'cron';
  sourceEventName?: string | null;
  occurredAt?: string;
};
```

- [ ] **Step 4: Copy the fields in the scheduler**

In `src/modules/delivery/scheduler.ts`, the `data:` block (~line 74):

```ts
    data: {
      taskId: dispatch.task_id,
      userId: dispatch.user_id,
      channel: dispatch.channel,
      campaignId,
      campaignMessageId,
      params,
      // Conditional spread, not `?? undefined`: an absent transition must leave
      // the keys off the job payload rather than serialising them as null.
      ...(dispatch.audience_id === undefined ? {} : { audienceId: dispatch.audience_id }),
      ...(dispatch.audience_name === undefined ? {} : { audienceName: dispatch.audience_name }),
      ...(dispatch.origin === undefined ? {} : { origin: dispatch.origin }),
      ...(dispatch.source_event_name === undefined ? {} : { sourceEventName: dispatch.source_event_name }),
      ...(dispatch.occurred_at === undefined ? {} : { occurredAt: dispatch.occurred_at }),
    },
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
pnpm --filter @svc/audience-campaign test -- scheduler.test.ts
pnpm --filter @svc/audience-campaign typecheck
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add services/audience-campaign/src/modules/delivery/queues.ts \
        services/audience-campaign/src/modules/delivery/scheduler.ts \
        services/audience-campaign/src/modules/delivery/scheduler.test.ts
git commit -m "feat(audience-campaign): carry transition context onto the delivery job

DeliveryJobData gains the five optional transition fields and planDispatch
copies them across. Conditional spread rather than nullish coalescing so an
absent transition leaves the keys off the payload entirely."
```

---

### Task 3: Merge the transition context into the `API_CALL` body

**Files:**
- Modify: `src/modules/delivery/api-call.ts` (`withIdentity`)
- Modify: `docs/event-contracts.md`
- Modify: `docs/delivery-channels.md`
- Test: `src/modules/delivery/channels.test.ts` (exists)

**Interfaces:**
- Consumes: `DeliveryJobData` with the transition fields from Task 2.
- Produces: the `API_CALL` request body now also carries `task_id`, `audience_id`, `audience_name`, `source_event_name`, `origin`, `occurred_at`. **This is the contract Phase 2 consumes.**

- [ ] **Step 1: Write the failing test**

Append to `src/modules/delivery/channels.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { withIdentity } from './api-call.ts';
import type { DeliveryJobData } from './queues.ts';

const JOB: DeliveryJobData = {
  taskId: 'campaign-delivery-91823',
  userId: 'u-123',
  channel: 'API_CALL',
  campaignId: 12,
  campaignMessageId: 44,
  params: {},
  audienceId: 42,
  audienceName: 'prabhuji-status-intro',
  origin: 'event',
  sourceEventName: 'set_wallpaper_result',
  occurredAt: '2026-09-11T06:35:00.000Z',
};

describe('withIdentity', () => {
  it('merges the transition context and the per-send id', () => {
    const body = withIdentity({ modal_key: 'status_intro', action: 'arm' }, JOB);

    expect(body).toEqual({
      modal_key: 'status_intro',
      action: 'arm',
      user_id: 'u-123',
      campaign_id: 12,
      campaign_message_id: 44,
      task_id: 'campaign-delivery-91823',
      audience_id: 42,
      audience_name: 'prabhuji-status-intro',
      origin: 'event',
      source_event_name: 'set_wallpaper_result',
      occurred_at: '2026-09-11T06:35:00.000Z',
    });
  });

  // The whole point of merging last. An author writing these means something
  // they cannot know per recipient.
  it('an author cannot shadow any merged field', () => {
    const body = withIdentity(
      { user_id: 'attacker', task_id: 'forged', source_event_name: 'lie', origin: 'cron' },
      JOB,
    );

    expect(body.user_id).toBe('u-123');
    expect(body.task_id).toBe('campaign-delivery-91823');
    expect(body.source_event_name).toBe('set_wallpaper_result');
    expect(body.origin).toBe('event');
  });

  it('omits transition keys for a job that carries no transition', () => {
    const { audienceId, audienceName, origin, sourceEventName, occurredAt, ...bare } = JOB;
    const body = withIdentity({ modal_key: 'status_intro' }, bare);

    expect(body).toEqual({
      modal_key: 'status_intro',
      user_id: 'u-123',
      campaign_id: 12,
      campaign_message_id: 44,
      task_id: 'campaign-delivery-91823',
    });
  });

  it('carries a null source_event_name from a cron exit', () => {
    const body = withIdentity({}, { ...JOB, origin: 'cron', sourceEventName: null });

    expect(body.origin).toBe('cron');
    expect(body.source_event_name).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @svc/audience-campaign test -- channels.test.ts
```
Expected: FAIL — the body has only `user_id`, `campaign_id`, `campaign_message_id`.

- [ ] **Step 3: Extend `withIdentity`**

Replace the function in `src/modules/delivery/api-call.ts`:

```ts
/**
 * The configured body, plus who this send is for and what caused it.
 *
 * The identity fields are added HERE rather than by the campaign or the sender.
 * The campaign has no business knowing a channel's body shape, and the sender
 * is a transport that should not know campaigns exist; this handler is the one
 * place where per-message configuration meets per-user job context.
 *
 * Merged LAST so nothing can be shadowed. An author who writes `"user_id": "42"`
 * into the body means something they cannot possibly know per recipient, and
 * letting that static value win would post the wrong user to a partner. The
 * same argument covers `source_event_name`: it is the fact that distinguishes
 * one arm from another, and a receiver that could be lied to about it cannot
 * attribute anything.
 *
 * `task_id` travels because dispatch is at-least-once, so the receiver needs
 * something stable to deduplicate on, and this is the only value that is.
 *
 * The transition keys are OMITTED, not nulled, when the job carries no
 * transition — a job enqueued before envelope version 2 has none, and a
 * receiver distinguishing "absent" from "null" must be able to.
 */
export function withIdentity(
  body: Record<string, unknown> | undefined,
  data: DeliveryJobData,
): Record<string, unknown> {
  return {
    ...body,
    user_id: data.userId,
    campaign_id: data.campaignId,
    campaign_message_id: data.campaignMessageId,
    task_id: data.taskId,
    ...(data.audienceId === undefined ? {} : { audience_id: data.audienceId }),
    ...(data.audienceName === undefined ? {} : { audience_name: data.audienceName }),
    ...(data.origin === undefined ? {} : { origin: data.origin }),
    ...(data.sourceEventName === undefined ? {} : { source_event_name: data.sourceEventName }),
    ...(data.occurredAt === undefined ? {} : { occurred_at: data.occurredAt }),
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm --filter @svc/audience-campaign test
pnpm --filter @svc/audience-campaign typecheck
```
Expected: all green.

- [ ] **Step 5: Update the two contract docs**

In `docs/delivery-channels.md`, replace the API_CALL "The body always says who it is about" example with:

```jsonc
{
  "reason": "welcome",                        // ← what the author configured
  "amount": 50,                               // ← what the author configured
  "user_id": "u-123",                         // ← added
  "campaign_id": 12,                          // ← added
  "campaign_message_id": 44,                  // ← added
  "task_id": "campaign-delivery-91823",       // ← added
  "audience_id": 42,                          // ← added (when the job has one)
  "audience_name": "high-depositors",         // ← added (when the job has one)
  "origin": "event",                          // ← added (when the job has one)
  "source_event_name": "deposit_completed",   // ← added; null on a cron exit
  "occurred_at": "2026-08-16T09:12:04.900Z"   // ← added (when the job has one)
}
```

and replace the "Deduplication is the receiver's problem to solve" paragraph with:

```markdown
**Deduplication is the receiver's problem to solve.** Dispatch is at-least-once,
so a partner will eventually see the same call twice. `task_id` is the key: it is
unique per send and stable across every redelivery of that send.

The five transition fields are present only when the job carries a transition —
a job enqueued before dispatch envelope version 2 has none. `source_event_name`
is `null` rather than absent on a cron exit, because a time-to-exit sweep is a
real transition with no source event.
```

In `docs/event-contracts.md`, update the dispatch version table row to
`| scheduling | 2 | transition context + task_id added to API_CALL bodies |`
and add the five fields to the `op: "send"` sample.

- [ ] **Step 6: Commit**

```bash
git add services/audience-campaign/src/modules/delivery/api-call.ts \
        services/audience-campaign/src/modules/delivery/channels.test.ts \
        services/audience-campaign/docs/
git commit -m "feat(audience-campaign): merge transition context into API_CALL bodies

withIdentity now also merges task_id, audience_id, audience_name, origin,
source_event_name and occurred_at — merged last, so a campaign author cannot
shadow them.

task_id closes the idempotency gap delivery-channels.md already invited
closing ('or ask for task_id to be added'). source_event_name is what makes
per-event attribution possible for a receiver whose modal needs to report
which outcome earned it."
```

---

# Phase 2 — prabhuji schema and helpers

All remaining work is in `~/Developer/krutyug/prabhuji-monorepo` on branch
`TAM-174-generalized-modal-audience-trigger`.

---

### Task 4: Promote `resolveDateIst` to `shared/time`

**Files:**
- Create: `apps/api/src/shared/time/date-ist.ts`
- Create: `apps/api/src/shared/time/index.ts`
- Create: `apps/api/src/shared/time/__tests__/date-ist.test.ts`
- Delete: `apps/api/src/core/horoscope/services/date-ist.ts`
- Modify: every horoscope file importing it

**Interfaces:**
- Produces: `resolveDateIst(at?: Date): string` and `resolveDateIstPlus(days: number, at?: Date): string`, importable as `@api/shared/time`.

**Why:** `core/modals` needs the IST civil date and modules cannot import each
other's internals (`pnpm check:arch-boundaries` enforces it). This repo already
carries two IST implementations — this one and `IST_OFFSET_MS` in
`shared/rotation` — and a third is how a day boundary silently drifts.

- [ ] **Step 1: Find every current importer**

```bash
cd ~/Developer/krutyug/prabhuji-monorepo
grep -rn "date-ist" apps/api/src --include="*.ts"
```
Record the list — Step 4 updates all of them.

- [ ] **Step 2: Write the failing test**

Create `apps/api/src/shared/time/__tests__/date-ist.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { resolveDateIst, resolveDateIstPlus } from "../date-ist.js";

/**
 * IST is UTC+5:30 with no DST, so the civil day rolls at 18:30 UTC. That
 * instant is the only boundary a UTC-based implementation gets wrong, and it is
 * the one every cap in `core/modals` depends on.
 */
describe("resolveDateIst", () => {
  test("18:29:59 UTC is still the same IST day", () => {
    expect(resolveDateIst(new Date("2026-09-11T18:29:59.000Z"))).toBe("2026-09-11");
  });

  test("18:30:00 UTC is already the next IST day", () => {
    expect(resolveDateIst(new Date("2026-09-11T18:30:00.000Z"))).toBe("2026-09-12");
  });

  test("midnight UTC is the same calendar day in IST", () => {
    expect(resolveDateIst(new Date("2026-09-11T00:00:00.000Z"))).toBe("2026-09-11");
  });

  test("crosses a month and a year boundary", () => {
    expect(resolveDateIst(new Date("2026-12-31T18:30:00.000Z"))).toBe("2027-01-01");
  });
});

describe("resolveDateIstPlus", () => {
  test("adds whole days", () => {
    expect(resolveDateIstPlus(1, new Date("2026-09-11T06:00:00.000Z"))).toBe("2026-09-12");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
pnpm nx test api --configuration=unit -- date-ist
```
Expected: FAIL — cannot resolve `../date-ist.js`.

- [ ] **Step 4: Move the file and re-point importers**

```bash
mkdir -p apps/api/src/shared/time
git mv apps/api/src/core/horoscope/services/date-ist.ts apps/api/src/shared/time/date-ist.ts
```

Create `apps/api/src/shared/time/index.ts`:

```ts
export { resolveDateIst, resolveDateIstPlus } from "./date-ist.js";
```

Update the doc comment at the top of `date-ist.ts` — it currently says
"TAM-73 / the daily-result key". Replace its first paragraph with:

```ts
/**
 * IST civil-date resolver. Shared because more than one module keys on the
 * civil date in `Asia/Kolkata` rather than the server's UTC date: horoscope's
 * `daily_horoscope_result.date_ist` (TAM-73) and the per-day modal cap
 * (TAM-174). A request at 23:30 UTC is already "tomorrow" in IST (UTC+5:30), so
 * keying off `new Date()`'s UTC date would serve the wrong day near midnight.
 *
 * Lives in `shared/` rather than in either module because `pnpm
 * check:arch-boundaries` forbids one module importing another's internals, and
 * a second copy is how the two modules' day boundaries drift apart.
 *
 * India observes no DST, so IST is a fixed +5:30 offset, but we still resolve
 * via `Intl` with an explicit `timeZone` so the logic is correct-by-construction
 * and survives any future tz change. Returns a stable `YYYY-MM-DD` string.
 */
```

Then update every importer found in Step 1 to `from "@api/shared/time"`. If
`core/horoscope/services/index.ts` re-exported it, drop that export.

If a test file moved with it, delete the old copy at
`apps/api/src/core/horoscope/services/__tests__/date-ist.test.ts` — the new
shared test supersedes it.

- [ ] **Step 5: Run tests, typecheck, lint and the boundary gate**

```bash
pnpm nx test api --configuration=unit -- date-ist
pnpm nx typecheck api
pnpm nx lint api
pnpm check:arch-boundaries
```
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/shared/time apps/api/src/core/horoscope
git commit -m "refactor(api): promote resolveDateIst to shared/time [TAM-174]

core/modals needs the IST civil date and modules cannot import each other's
internals. Moved rather than copied: the repo already carries two IST
implementations and a third is how a day boundary silently drifts."
```

---

### Task 5: Prisma models, migration, and the module's types

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/<timestamp>_tam_174_modals/migration.sql` (generated)
- Create: `apps/api/src/core/modals/types.ts`

**Interfaces:**
- Produces (consumed by every later task):

```ts
export type ModalTriggerSource = string;
export type ModalHookAction = "arm" | "halt";
export type ModalHookOrigin = "event" | "cron";

export interface ModalContentEntry {
  title: string;
  body?: string;
  imageUrl?: string;
  ctaText: string;
  ctaDeeplink: string;
}
export type ModalContentMap = Record<string, ModalContentEntry>;

export interface ModalHookInput {
  taskId: string;
  action: ModalHookAction;
  origin: ModalHookOrigin;
  userId: string;
  modalKey: string;
  triggerSource: string;
  surface: string | null;
  content: ModalContentMap | null;
  maxLifetime: number | null;
  maxPerDay: number | null;
  sourceEventName: string | null;
  audienceId: number | null;
  audienceName: string | null;
  campaignId: number | null;
  occurredAt: Date;
}

export interface ModalStateRow {
  userId: string;
  modalKey: string;
  triggerSource: string;
  surface: string | null;
  content: ModalContentMap;
  armedAt: Date | null;
  lastOutcomeModule: string | null;
  showCount: number;
  shownTodayCount: number;
  lastShownDateIst: string | null;
  maxLifetime: number;
  maxPerDay: number;
  haltedAt: Date | null;
}

export interface ServableModal {
  key: string;
  triggerSource: string;
  showNumber: number;
  lastOutcomeModule: string | null;
  localeServed: string;
  content: ModalContentEntry;
}

export type ModalImpressionAction = "viewed" | "cta_clicked" | "dismissed";
export type ModalDismissMethod = "cross" | "back" | "outside_tap";

/** The seam every service method depends on. The Prisma impl lands in Task 10. */
export interface ModalsRepositoryPort {
  recordDelivery(input: {
    taskId: string;
    action: ModalHookAction;
    origin: ModalHookOrigin;
    userId: string;
    modalKey: string;
    sourceEventName: string | null;
    audienceId: number | null;
    campaignId: number | null;
    applied: boolean;
  }): Promise<boolean>;
  findState(userId: string, modalKey: string, triggerSource: string): Promise<ModalStateRow | null>;
  upsertArm(input: ModalHookInput): Promise<void>;
  applyHalt(input: ModalHookInput): Promise<void>;
  clearArm(userId: string, modalKey: string, triggerSource: string): Promise<void>;
  findServable(userId: string, surface: string, todayIst: string): Promise<ModalStateRow | null>;
  advanceLedger(input: {
    userId: string;
    modalKey: string;
    triggerSource: string;
    todayIst: string;
    rolled: boolean;
  }): Promise<boolean>;
  appendImpression(input: {
    userId: string;
    modalKey: string;
    triggerSource: string;
    action: ModalImpressionAction;
    dismissMethod: ModalDismissMethod | null;
    showNumber: number;
    lastOutcomeModule: string | null;
  }): Promise<void>;
}
```

- [ ] **Step 1: Add the three models**

Append to `apps/api/prisma/schema.prisma`:

```prisma
// -----------------------------------------------------------------------------
// TAM-174: Generalized in-app modals, armed by audience-campaign webhooks.
//
// Nothing here names a specific modal. The key, copy, deep link, surface and
// caps all arrive on the arm webhook, so a second modal is a campaign row and
// no deploy.
//
// The caps are SERVER-owned and per-USER, not per-device: a reinstall or a
// second phone must not reset a lifetime limit of three.
// -----------------------------------------------------------------------------

/// One user's standing with one modal, per trigger source. Three concerns that
/// share a key AND a lifetime live on one row: the standing eligibility a
/// webhook granted, the cap ledger, and the halt.
///
/// They were briefly separate tables. Once audience membership became STANDING
/// (timeToExitDays: null — see the spec) a show stopped consuming the arm, so
/// the two shared a lifetime and the split bought nothing.
model ModalUserState {
  id            String @id @default(uuid(7)) @db.Uuid
  userId        String @map("user_id") @db.Uuid
  modalKey      String @map("modal_key")
  triggerSource String @map("trigger_source")

  /// Standing eligibility — written by the `arm` webhook.
  ///
  /// `surface` and `content` are NULLABLE / defaulted because a HALT can arrive
  /// before any arm ever does: audience B's entry rule fires for a user who
  /// shared a named status without ever qualifying for the modal, and that row
  /// is created carrying only the halt.
  surface           String?
  content           Json      @default("{}")
  /// The transition's own time (`occurred_at`), NOT receipt time.
  armedAt           DateTime? @map("armed_at")
  lastOutcomeModule String?   @map("last_outcome_module")
  audienceId        Int?      @map("audience_id")
  audienceName      String?   @map("audience_name")
  campaignId        Int?      @map("campaign_id")

  /// Cap ledger — written by each `viewed` impression and nothing else.
  showCount        Int       @default(0) @map("show_count")
  shownTodayCount  Int       @default(0) @map("shown_today_count")
  /// `YYYY-MM-DD` civil date in Asia/Kolkata. A TEXT day, never a UTC
  /// timestamp, so the boundary is unambiguous — same convention as
  /// `daily_horoscope_result.date_ist`.
  lastShownDateIst String?   @map("last_shown_date_ist")
  lastShownAt      DateTime? @map("last_shown_at")
  /// Last-written by the newest arm, so a modal whose campaign changes its caps
  /// takes effect on the next arm without a deploy.
  maxLifetime      Int       @default(3) @map("max_lifetime")
  maxPerDay        Int       @default(1) @map("max_per_day")

  /// The halt — written by a `halt` webhook with `origin: "event"`. Set once,
  /// never cleared by anything, including a later arm.
  haltedAt     DateTime? @map("halted_at")
  haltedReason String?   @map("halted_reason")

  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  @@unique([userId, modalKey, triggerSource])
  /// The read path: this user's modals for one surface.
  @@index([userId, surface])
  @@map("modal_user_states")
}

/// Idempotency for at-least-once dispatch, and the audit trail behind "why did
/// this user see it three times".
///
/// `task_id` is the primary key because it is the only value on a dispatch that
/// is unique per send AND stable across every redelivery of that send.
/// `(campaign_message_id, user_id)` is not: it repeats across all three allowed
/// shows.
model ModalHookDelivery {
  taskId          String   @id @map("task_id")
  action          String
  origin          String
  userId          String   @map("user_id") @db.Uuid
  modalKey        String   @map("modal_key")
  sourceEventName String?  @map("source_event_name")
  audienceId      Int?     @map("audience_id")
  campaignId      Int?     @map("campaign_id")
  /// false = a duplicate delivery, or an arm onto an already-halted row.
  applied         Boolean  @default(true)
  receivedAt      DateTime @default(now()) @map("received_at")

  @@map("modal_hook_deliveries")
}

/// Append-only. What the server believes it showed, beside what the app
/// reported — the join that explains a funnel drop.
model ModalImpression {
  id                BigInt   @id @default(autoincrement())
  userId            String   @map("user_id") @db.Uuid
  modalKey          String   @map("modal_key")
  triggerSource     String   @map("trigger_source")
  /// viewed | cta_clicked | dismissed
  action            String
  /// cross | back | outside_tap. Only meaningful with `dismissed`.
  dismissMethod     String?  @map("dismiss_method")
  showNumber        Int      @map("show_number")
  lastOutcomeModule String?  @map("last_outcome_module")
  occurredAt        DateTime @default(now()) @map("occurred_at")

  @@index([userId, modalKey, occurredAt])
  @@map("modal_impressions")
}
```

- [ ] **Step 2: Generate the migration**

```bash
docker compose up -d
cd apps/api && pnpm exec prisma migrate dev --name tam_174_modals && cd ../..
```
Expected: a new folder under `apps/api/prisma/migrations/` and `prisma generate` rerun.

- [ ] **Step 3: Create `types.ts`**

Write the full `Interfaces` block above to `apps/api/src/core/modals/types.ts`, with this header:

```ts
/**
 * Domain types for the generalized modal module (TAM-174).
 *
 * `ModalsRepositoryPort` is declared here rather than in `repositories/` so the
 * service can depend on the SEAM instead of the Prisma implementation: service
 * unit tests hand it a plain object, and `pnpm check:arch-boundaries` keeps
 * `@prisma/client` confined to `repositories/`.
 */
```

- [ ] **Step 4: Verify the schema compiles and the types typecheck**

```bash
pnpm nx typecheck api
pnpm exec prisma validate --schema apps/api/prisma/schema.prisma
```
Expected: both PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/prisma apps/api/src/core/modals/types.ts
git commit -m "feat(api): modal state, hook delivery and impression models [TAM-174]

Three tables. ModalUserState carries the standing eligibility, the cap ledger
and the halt on one row because, with standing audience membership, a show no
longer consumes the arm and the three share a lifetime.

surface and content are nullable/defaulted: a halt can arrive before any arm
(audience B's entry rule), creating a row that carries only the halt."
```

---

# Phase 3 — the service, TDD against a fake repository

Every task in this phase adds cases to one growing test file,
`apps/api/src/core/modals/services/__tests__/modals.service.test.ts`, backed by a
hand-rolled fake. This codebase uses no mocking library — fakes are plain objects.

---

### Task 6: The `arm` branch and `task_id` idempotency

**Files:**
- Create: `apps/api/src/core/modals/services/modals.service.ts`
- Create: `apps/api/src/core/modals/services/index.ts`
- Create: `apps/api/src/core/modals/services/__tests__/modals.service.test.ts`

**Interfaces:**
- Consumes: everything from `types.ts` (Task 5).
- Produces: `class ModalsService { constructor(repo: ModalsRepositoryPort); handleHook(input: ModalHookInput): Promise<{ applied: boolean; reason: string }> }`

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/core/modals/services/__tests__/modals.service.test.ts`:

```ts
import { beforeEach, describe, expect, test } from "vitest";
import { ModalsService } from "../modals.service.js";
import type {
  ModalHookInput,
  ModalStateRow,
  ModalsRepositoryPort,
} from "@api/core/modals/types";

/**
 * Hand-rolled fake, matching this repo's convention (no mocking library).
 * It records calls so a test can assert "nothing was written" as precisely as
 * "this was written".
 */
class FakeRepo implements ModalsRepositoryPort {
  state: ModalStateRow | null = null;
  seenTaskIds = new Set<string>();
  calls: string[] = [];

  // Each field is annotated with the PORT's method type rather than letting the
  // initialiser infer one. Later tests reassign these with a typed parameter
  // (`repo.advanceLedger = (input) => …`), and an inferred zero-arg type would
  // make that parameter an implicit `any` — a lint and strict-mode error.
  //
  // Not `async` — every body here is purely synchronous, and this repo enforces
  // `@typescript-eslint/require-await` as an ERROR. An explicit
  // `Promise.resolve(...)` keeps the port's Promise return type without the
  // disallowed no-op `async`.
  recordDelivery: ModalsRepositoryPort["recordDelivery"] = (input) => {
    this.calls.push("recordDelivery");
    if (this.seenTaskIds.has(input.taskId)) return Promise.resolve(false);
    this.seenTaskIds.add(input.taskId);
    return Promise.resolve(true);
  };
  findState: ModalsRepositoryPort["findState"] = () => Promise.resolve(this.state);
  upsertArm: ModalsRepositoryPort["upsertArm"] = () => {
    this.calls.push("upsertArm");
    return Promise.resolve();
  };
  applyHalt: ModalsRepositoryPort["applyHalt"] = () => {
    this.calls.push("applyHalt");
    return Promise.resolve();
  };
  clearArm: ModalsRepositoryPort["clearArm"] = () => {
    this.calls.push("clearArm");
    return Promise.resolve();
  };
  findServable: ModalsRepositoryPort["findServable"] = () => Promise.resolve(null);
  advanceLedger: ModalsRepositoryPort["advanceLedger"] = () => Promise.resolve(true);
  appendImpression: ModalsRepositoryPort["appendImpression"] = () => {
    this.calls.push("appendImpression");
    return Promise.resolve();
  };
}

function armInput(overrides: Partial<ModalHookInput> = {}): ModalHookInput {
  return {
    taskId: "campaign-delivery-91823",
    action: "arm",
    origin: "event",
    userId: "01a01482-6685-7233-8000-000000000001",
    modalKey: "status_intro",
    triggerSource: "post_outcome",
    surface: "home",
    content: {
      hi: { title: "अब स्टेटस पर दिखेगा आपका नाम और फोटो", ctaText: "नाम और फोटो डालें", ctaDeeplink: "prabhuji://status/personal-details" },
      en: { title: "Your name and photo on your status", ctaText: "Add name and photo", ctaDeeplink: "prabhuji://status/personal-details" },
    },
    maxLifetime: 3,
    maxPerDay: 1,
    sourceEventName: "set_wallpaper_result",
    audienceId: 42,
    audienceName: "prabhuji-status-intro",
    campaignId: 12,
    occurredAt: new Date("2026-09-11T06:35:00.000Z"),
    ...overrides,
  };
}

function stateRow(overrides: Partial<ModalStateRow> = {}): ModalStateRow {
  return {
    userId: "01a01482-6685-7233-8000-000000000001",
    modalKey: "status_intro",
    triggerSource: "post_outcome",
    surface: "home",
    content: {},
    armedAt: new Date("2026-09-11T06:35:00.000Z"),
    lastOutcomeModule: "set_wallpaper_result",
    showCount: 0,
    shownTodayCount: 0,
    lastShownDateIst: null,
    maxLifetime: 3,
    maxPerDay: 1,
    haltedAt: null,
    ...overrides,
  };
}

let repo: FakeRepo;
let service: ModalsService;

beforeEach(() => {
  repo = new FakeRepo();
  service = new ModalsService(repo);
});

describe("handleHook — arm", () => {
  test("arms a user with no prior state", async () => {
    const result = await service.handleHook(armInput());

    expect(result.applied).toBe(true);
    expect(repo.calls).toContain("upsertArm");
  });

  test("a repeated task_id changes nothing and still succeeds", async () => {
    await service.handleHook(armInput());
    repo.calls = [];

    const second = await service.handleHook(armInput());

    expect(second.applied).toBe(false);
    expect(second.reason).toBe("duplicate");
    expect(repo.calls).not.toContain("upsertArm");
  });

  test("an arm onto a halted row is recorded and ignored", async () => {
    repo.state = stateRow({ haltedAt: new Date("2026-09-10T00:00:00.000Z") });

    const result = await service.handleHook(armInput({ taskId: "campaign-delivery-2" }));

    expect(result.applied).toBe(false);
    expect(result.reason).toBe("halted");
    expect(repo.calls).not.toContain("upsertArm");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm nx test api --configuration=unit -- modals.service
```
Expected: FAIL — cannot resolve `../modals.service.js`.

- [ ] **Step 3: Write the minimal service**

Create `apps/api/src/core/modals/services/modals.service.ts`:

```ts
import { createModuleLogger } from "@api/shared/logs";
import type { ModalHookInput, ModalsRepositoryPort } from "@api/core/modals/types";

const log = createModuleLogger("modals:service");

export interface HookOutcome {
  applied: boolean;
  /** Why, for the log and the 200 body. Never surfaced to an end user. */
  reason: string;
}

/**
 * The generalized modal service.
 *
 * Nothing here names a modal. `modalKey`, `triggerSource`, the copy, the caps
 * and the surface all arrive on the webhook, so a second modal is configuration.
 */
export class ModalsService {
  constructor(private readonly repo: ModalsRepositoryPort) {}

  /**
   * Applies one campaign webhook.
   *
   * NEVER throws for a payload it understood. Dispatch treats a 4xx as a
   * PERMANENT failure — one attempt, no retry, the arm is lost — so "I have
   * already seen this" and "this user is halted" are both successful outcomes
   * that happen to change nothing.
   */
  async handleHook(input: ModalHookInput): Promise<HookOutcome> {
    // Whether an arm will apply is knowable BEFORE the claim: `haltedAt` is set
    // once and never cleared, so the read cannot go stale between here and the
    // write. Deciding first is what lets the ledger row record the REAL outcome
    // in a single write — `recordDelivery` can never be corrected afterwards,
    // because a redelivery conflicts on the taskId primary key and writes
    // nothing. A halt is also permanent and outranks any later arm; re-entry
    // into the audience after a named share is an ordinary path, not a bug.
    const halted =
      input.action === "arm" &&
      (await this.repo.findState(input.userId, input.modalKey, input.triggerSource))?.haltedAt != null;

    const fresh = await this.repo.recordDelivery({
      taskId: input.taskId,
      action: input.action,
      origin: input.origin,
      userId: input.userId,
      modalKey: input.modalKey,
      sourceEventName: input.sourceEventName,
      audienceId: input.audienceId,
      campaignId: input.campaignId,
      applied: !halted,
    });
    if (!fresh) {
      log.debug({ task_id: input.taskId }, "duplicate modal hook delivery ignored");
      return { applied: false, reason: "duplicate" };
    }

    if (halted) {
      log.debug({ modal_key: input.modalKey }, "arm onto a halted modal ignored");
      return { applied: false, reason: "halted" };
    }

    if (input.action === "arm") {
      await this.repo.upsertArm(input);
      log.info(
        { modal_key: input.modalKey, trigger_source: input.triggerSource, source_event: input.sourceEventName },
        "modal armed"
      );
      return { applied: true, reason: "armed" };
    }
    return { applied: false, reason: "unhandled" };
  }
}
```

Create `apps/api/src/core/modals/services/index.ts`:

```ts
export { ModalsService } from "./modals.service.js";
export type { HookOutcome } from "./modals.service.js";
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm nx test api --configuration=unit -- modals.service
```
Expected: PASS — 3 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/core/modals/services
git commit -m "feat(api): modal service arm branch with task_id idempotency [TAM-174]

A repeated task_id and an arm onto a halted row both return applied:false and
still succeed. Dispatch treats a 4xx as permanent — one attempt, no retry — so
neither may be an error."
```

---

### Task 7: The `halt` branches

**Files:**
- Modify: `apps/api/src/core/modals/services/modals.service.ts`
- Modify: `apps/api/src/core/modals/services/__tests__/modals.service.test.ts`

**Interfaces:**
- Consumes: `ModalsService.handleHook` from Task 6.
- Produces: no signature change — `handleHook` now also handles `action: "halt"`.

- [ ] **Step 1: Write the failing test**

Append to the test file:

```ts
describe("handleHook — halt", () => {
  test("origin:event halts permanently", async () => {
    repo.state = stateRow();

    const result = await service.handleHook(
      armInput({
        taskId: "campaign-delivery-3",
        action: "halt",
        origin: "event",
        sourceEventName: "status_share_result",
      })
    );

    expect(result.applied).toBe(true);
    expect(result.reason).toBe("halted");
    expect(repo.calls).toContain("applyHalt");
    expect(repo.calls).not.toContain("clearArm");
  });

  // A halt that arrives BEFORE any arm is the whole reason audience B exists:
  // a user who shares a named status without ever qualifying for the modal is
  // never a member of audience A, so A's exit rule can never fire for them.
  test("origin:event with no existing row still halts", async () => {
    repo.state = null;

    const result = await service.handleHook(
      armInput({ taskId: "campaign-delivery-4", action: "halt", origin: "event" })
    );

    expect(result.applied).toBe(true);
    expect(repo.calls).toContain("applyHalt");
  });

  // A cron expiry is not a user action. Halting on one would permanently hide a
  // modal because a sweep ran, which presents as "it stopped working for some
  // users" and is close to undiagnosable.
  test("origin:cron clears the arm and does NOT halt", async () => {
    repo.state = stateRow();

    const result = await service.handleHook(
      armInput({
        taskId: "campaign-delivery-5",
        action: "halt",
        origin: "cron",
        sourceEventName: null,
      })
    );

    expect(result.applied).toBe(true);
    expect(result.reason).toBe("expired");
    expect(repo.calls).toContain("clearArm");
    expect(repo.calls).not.toContain("applyHalt");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm nx test api --configuration=unit -- modals.service
```
Expected: FAIL — the three new tests get `reason: "unhandled"`.

- [ ] **Step 3: Implement the branches**

In `modals.service.ts`, replace the tail of `handleHook`:

```ts
    if (input.action === "arm") {
      await this.repo.upsertArm(input);
      log.info(
        { modal_key: input.modalKey, trigger_source: input.triggerSource, source_event: input.sourceEventName },
        "modal armed"
      );
      return { applied: true, reason: "armed" };
    }
    return this.halt(input);
  }

  /**
   * A `halt` webhook.
   *
   * Two origins, opposite meanings. `event` is the real halt condition — the
   * user did the thing the modal was asking for, and it must never appear
   * again. `cron` is a time-to-exit sweep expiring a membership, which is not a
   * user action at all: it clears the pending arm and nothing more.
   *
   * The cron branch is DEAD CODE for the Status intro modal, whose audience sets
   * no `timeToExitDays` and therefore produces no cron exits. It ships anyway,
   * because the day a modal does set an expiry its absence is a silent
   * permanent-halt bug.
   */
  private async halt(input: ModalHookInput): Promise<HookOutcome> {
    if (input.origin === "cron") {
      await this.repo.clearArm(input.userId, input.modalKey, input.triggerSource);
      log.debug({ modal_key: input.modalKey }, "modal arm expired by a cron exit");
      return { applied: true, reason: "expired" };
    }

    // Upserts, and spans every trigger source for this (user, modal): the halt
    // condition means this modal is DONE for this user, not done for one
    // trigger. With no row at all it creates one carrying only the halt, so a
    // halt arriving before any arm still blocks the future arm.
    await this.repo.applyHalt(input);
    log.info(
      { modal_key: input.modalKey, reason: input.sourceEventName },
      "modal halted permanently"
    );
    return { applied: true, reason: "halted" };
  }
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm nx test api --configuration=unit -- modals.service
```
Expected: PASS — 6 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/core/modals/services
git commit -m "feat(api): modal halt branches, split on origin [TAM-174]

origin:event halts permanently and upserts, so a halt arriving before any arm
(audience B's path) still blocks the future arm. origin:cron only clears the
pending arm — a sweep expiring a membership is not a user action, and halting
on one would hide a modal permanently because a cron ran."
```

---

### Task 8: The serve gate and locale fallback

**Files:**
- Modify: `apps/api/src/core/modals/services/modals.service.ts`
- Modify: `apps/api/src/core/modals/services/__tests__/modals.service.test.ts`

**Interfaces:**
- Produces: `ModalsService.next(userId: string, surface: string, locale: string | undefined, now?: Date): Promise<ServableModal | null>`

- [ ] **Step 1: Write the failing test**

Append to the test file. Make `FakeRepo.findServable` return `this.state` and add a
`servableFilter` flag so the test drives the gate through the real service:

```ts
describe("next — the serve gate", () => {
  // The repository applies the SQL gate; the service applies the same rules to
  // whatever it gets back, so a row the repo let through for the wrong reason
  // still cannot be served.
  test("serves an armed, uncapped modal with showNumber = showCount + 1", async () => {
    repo.state = stateRow({ showCount: 1, shownTodayCount: 1, lastShownDateIst: "2026-09-10" });
    repo.state.content = {
      hi: { title: "नाम और फोटो", ctaText: "डालें", ctaDeeplink: "prabhuji://status" },
    };
    repo.findServable = () => Promise.resolve(repo.state);

    const modal = await service.next(
      "01a01482-6685-7233-8000-000000000001",
      "home",
      "hi",
      new Date("2026-09-11T06:00:00.000Z")
    );

    expect(modal).not.toBeNull();
    expect(modal?.showNumber).toBe(2);
    expect(modal?.localeServed).toBe("hi");
    expect(modal?.lastOutcomeModule).toBe("set_wallpaper_result");
  });

  test("returns null when nothing is armed", async () => {
    repo.findServable = () => Promise.resolve(null);

    expect(await service.next("u", "home", "hi")).toBeNull();
  });

  test("returns null when the lifetime cap is reached", async () => {
    repo.state = stateRow({ showCount: 3, maxLifetime: 3 });
    repo.findServable = () => Promise.resolve(repo.state);

    expect(await service.next("u", "home", "hi", new Date("2026-09-11T06:00:00.000Z"))).toBeNull();
  });

  test("returns null when today's cap is reached", async () => {
    // 06:00 UTC on the 11th is 11:30 IST on the 11th.
    repo.state = stateRow({ shownTodayCount: 1, maxPerDay: 1, lastShownDateIst: "2026-09-11" });
    repo.findServable = () => Promise.resolve(repo.state);

    expect(await service.next("u", "home", "hi", new Date("2026-09-11T06:00:00.000Z"))).toBeNull();
  });

  test("serves again once the IST day has rolled", async () => {
    repo.state = stateRow({ shownTodayCount: 1, maxPerDay: 1, lastShownDateIst: "2026-09-11" });
    repo.state.content = { en: { title: "t", ctaText: "c", ctaDeeplink: "d" } };
    repo.findServable = () => Promise.resolve(repo.state);

    // 18:30 UTC on the 11th is already the 12th in IST.
    const modal = await service.next("u", "home", "en", new Date("2026-09-11T18:30:00.000Z"));

    expect(modal).not.toBeNull();
  });

  test("maxPerDay of 2 serves twice on the same IST day", async () => {
    repo.state = stateRow({ shownTodayCount: 1, maxPerDay: 2, lastShownDateIst: "2026-09-11" });
    repo.state.content = { en: { title: "t", ctaText: "c", ctaDeeplink: "d" } };
    repo.findServable = () => Promise.resolve(repo.state);

    expect(await service.next("u", "home", "en", new Date("2026-09-11T06:00:00.000Z"))).not.toBeNull();
  });

  test("returns null when halted", async () => {
    repo.state = stateRow({ haltedAt: new Date("2026-09-10T00:00:00.000Z") });
    repo.findServable = () => Promise.resolve(repo.state);

    expect(await service.next("u", "home", "hi", new Date("2026-09-11T06:00:00.000Z"))).toBeNull();
  });
});

describe("next — locale fallback", () => {
  function withContent(content: Record<string, unknown>) {
    repo.state = stateRow();
    repo.state.content = content as never;
    repo.findServable = () => Promise.resolve(repo.state);
  }
  const AT = new Date("2026-09-11T06:00:00.000Z");

  test("falls back to hi when the requested locale is absent", async () => {
    withContent({
      hi: { title: "h", ctaText: "c", ctaDeeplink: "d" },
      en: { title: "e", ctaText: "c", ctaDeeplink: "d" },
    });

    const modal = await service.next("u", "home", "mr", AT);
    expect(modal?.localeServed).toBe("hi");
  });

  test("falls back to en when hi is absent too", async () => {
    withContent({ en: { title: "e", ctaText: "c", ctaDeeplink: "d" } });

    const modal = await service.next("u", "home", "mr", AT);
    expect(modal?.localeServed).toBe("en");
  });

  test("falls back to the first key present when neither hi nor en exists", async () => {
    withContent({ ta: { title: "t", ctaText: "c", ctaDeeplink: "d" } });

    const modal = await service.next("u", "home", "mr", AT);
    expect(modal?.localeServed).toBe("ta");
  });

  // A modal with no copy is worse than no modal: the app would paint an empty
  // sheet the user has to dismiss.
  test("returns null rather than a modal with empty copy", async () => {
    withContent({});

    expect(await service.next("u", "home", "hi", AT)).toBeNull();
  });

  test("an absent locale param still resolves", async () => {
    withContent({ hi: { title: "h", ctaText: "c", ctaDeeplink: "d" } });

    const modal = await service.next("u", "home", undefined, AT);
    expect(modal?.localeServed).toBe("hi");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm nx test api --configuration=unit -- modals.service
```
Expected: FAIL — `service.next is not a function`.

- [ ] **Step 3: Implement `next` and the locale resolver**

Add to `modals.service.ts` (and add `import { resolveDateIst } from "@api/shared/time";` plus the `ModalContentEntry`, `ModalContentMap`, `ModalStateRow`, `ServableModal` type imports):

```ts
/**
 * The fallback chain, in order. `hi` before `en` because this app's users are
 * overwhelmingly Hindi-first; an English string is the last resort, not the
 * default.
 */
const LOCALE_FALLBACKS = ["hi", "en"] as const;

function resolveContent(
  content: ModalContentMap,
  requested: string | undefined
): { locale: string; entry: ModalContentEntry } | null {
  const candidates = [
    ...(requested ? [requested] : []),
    ...LOCALE_FALLBACKS,
    ...Object.keys(content),
  ];
  for (const locale of candidates) {
    const entry = content[locale];
    // A present-but-empty entry is treated as absent: a modal with no title and
    // no CTA is an empty sheet the user has to dismiss, which is worse than no
    // modal at all.
    if (entry && entry.title && entry.ctaText && entry.ctaDeeplink) {
      return { locale, entry };
    }
  }
  return null;
}
```

and the method:

```ts
  /**
   * The modal to show this user on this surface right now, or null.
   *
   * Does NOT count a show. The app can fetch this and never render it — the
   * user backgrounds the app, a higher-priority sheet wins — so the count
   * belongs on the impression, which is the app SAYING it painted.
   *
   * The gate is applied here as well as in SQL. The repository's WHERE clause is
   * the fast path; this is the one that is unit-testable and the one a reviewer
   * reads.
   */
  async next(
    userId: string,
    surface: string,
    locale: string | undefined,
    now: Date = new Date()
  ): Promise<ServableModal | null> {
    const todayIst = resolveDateIst(now);
    const state = await this.repo.findServable(userId, surface, todayIst);
    if (!state) return null;

    if (state.haltedAt !== null) return null;
    if (state.armedAt === null) return null;
    if (state.showCount >= state.maxLifetime) return null;
    if (state.lastShownDateIst === todayIst && state.shownTodayCount >= state.maxPerDay) {
      return null;
    }

    const resolved = resolveContent(state.content, locale);
    if (!resolved) {
      log.warn(
        { modal_key: state.modalKey, requested_locale: locale },
        "armed modal has no usable copy in any locale; serving nothing"
      );
      return null;
    }

    return {
      key: state.modalKey,
      triggerSource: state.triggerSource,
      // What this show WOULD be. The client puts it on
      // `modal_viewed.show_number` (with `modal_key` carrying which modal),
      // so the number the funnel sees is the server's, not a client-side
      // guess that can drift.
      showNumber: state.showCount + 1,
      lastOutcomeModule: state.lastOutcomeModule,
      localeServed: resolved.locale,
      content: resolved.entry,
    };
  }
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm nx test api --configuration=unit -- modals.service
```
Expected: PASS — 18 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/core/modals/services
git commit -m "feat(api): modal serve gate and locale fallback [TAM-174]

The cap gate is applied in the service as well as in SQL — the WHERE clause is
the fast path, this is the unit-testable one. maxPerDay is a real counter, so a
future modal can ask for two a day with no code change.

A modal whose content map has no usable entry serves null: an empty sheet the
user must dismiss is worse than no modal."
```

---

### Task 9: The impression ledger

**Files:**
- Modify: `apps/api/src/core/modals/services/modals.service.ts`
- Modify: `apps/api/src/core/modals/services/__tests__/modals.service.test.ts`

**Interfaces:**
- Produces: `ModalsService.recordImpression(input: { userId, modalKey, triggerSource, action, dismissMethod, now? }): Promise<{ counted: boolean }>`

- [ ] **Step 1: Write the failing test**

Append to the test file:

```ts
describe("recordImpression", () => {
  const USER = "01a01482-6685-7233-8000-000000000001";

  function impression(overrides: Record<string, unknown> = {}) {
    return {
      userId: USER,
      modalKey: "status_intro",
      triggerSource: "post_outcome",
      action: "viewed" as const,
      dismissMethod: null,
      now: new Date("2026-09-11T06:00:00.000Z"),
      ...overrides,
    };
  }

  test("a viewed impression advances the ledger", async () => {
    repo.state = stateRow();
    let advanced: { todayIst: string; rolled: boolean } | null = null;
    repo.advanceLedger = (input) => {
      advanced = { todayIst: input.todayIst, rolled: input.rolled };
      return Promise.resolve(true);
    };

    const result = await service.recordImpression(impression());

    expect(result.counted).toBe(true);
    expect(advanced).toEqual({ todayIst: "2026-09-11", rolled: true });
    expect(repo.calls).toContain("appendImpression");
  });

  test("rolled is false when the stored IST day is today", async () => {
    repo.state = stateRow({ lastShownDateIst: "2026-09-11", shownTodayCount: 0 });
    let rolled: boolean | null = null;
    repo.advanceLedger = (input) => {
      rolled = input.rolled;
      return Promise.resolve(true);
    };

    await service.recordImpression(impression());

    expect(rolled).toBe(false);
  });

  // 18:29 UTC and 18:31 UTC on the same date are DIFFERENT IST days. This is
  // the one boundary a UTC-based implementation gets wrong.
  test("18:29 UTC still counts against the same IST day", async () => {
    repo.state = stateRow({ lastShownDateIst: "2026-09-11" });
    let rolled: boolean | null = null;
    repo.advanceLedger = (input) => {
      rolled = input.rolled;
      return Promise.resolve(true);
    };

    await service.recordImpression(impression({ now: new Date("2026-09-11T18:29:59.000Z") }));

    expect(rolled).toBe(false);
  });

  test("18:30 UTC rolls to the next IST day", async () => {
    repo.state = stateRow({ lastShownDateIst: "2026-09-11" });
    let captured: { todayIst: string; rolled: boolean } | null = null;
    repo.advanceLedger = (input) => {
      captured = { todayIst: input.todayIst, rolled: input.rolled };
      return Promise.resolve(true);
    };

    await service.recordImpression(impression({ now: new Date("2026-09-11T18:30:00.000Z") }));

    expect(captured).toEqual({ todayIst: "2026-09-12", rolled: true });
  });

  test("cta_clicked and dismissed append but never advance the ledger", async () => {
    repo.state = stateRow();
    let advanceCalls = 0;
    repo.advanceLedger = () => {
      advanceCalls += 1;
      return Promise.resolve(true);
    };

    await service.recordImpression(impression({ action: "cta_clicked" }));
    await service.recordImpression(impression({ action: "dismissed", dismissMethod: "cross" }));

    expect(advanceCalls).toBe(0);
    expect(repo.calls.filter((c) => c === "appendImpression")).toHaveLength(2);
  });

  // The conditional update's affected-row count is the authority, exactly as
  // AudienceMembership uses it to keep userCount exact. A second viewed for the
  // same show loses the race and must not count.
  test("a losing conditional update does not count the show", async () => {
    repo.state = stateRow();
    repo.advanceLedger = () => Promise.resolve(false);

    const result = await service.recordImpression(impression());

    expect(result.counted).toBe(false);
  });

  test("an impression for an unknown modal is a no-op, not an error", async () => {
    repo.state = null;

    const result = await service.recordImpression(impression());

    expect(result.counted).toBe(false);
    expect(repo.calls).not.toContain("appendImpression");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm nx test api --configuration=unit -- modals.service
```
Expected: FAIL — `service.recordImpression is not a function`.

- [ ] **Step 3: Implement `recordImpression`**

Extend the type import at the top of `modals.service.ts` with
`ModalImpressionAction` and `ModalDismissMethod`, then add:

```ts
  /**
   * Records what the app says it did with a modal.
   *
   * Only `viewed` advances the ledger — a click and a dismissal are both things
   * that happen to a modal already counted as shown, and counting them would
   * spend two of the user's three lifetime shows on one appearance.
   *
   * The advance is a CONDITIONAL update whose affected-row count is the
   * authority (the trick `AudienceMembership` uses to keep `userCount` exact
   * under concurrency), so a double-fired `viewed` cannot count twice.
   */
  async recordImpression(input: {
    userId: string;
    modalKey: string;
    triggerSource: string;
    action: ModalImpressionAction;
    dismissMethod: ModalDismissMethod | null;
    now?: Date;
  }): Promise<{ counted: boolean }> {
    const now = input.now ?? new Date();
    const state = await this.repo.findState(input.userId, input.modalKey, input.triggerSource);
    // Nothing to attribute the impression to. A no-op rather than a 404: the
    // app is reporting something it already did, and failing the call would
    // make it retry a report that can never succeed.
    if (!state) {
      log.debug(
        { modal_key: input.modalKey, action: input.action },
        "impression for an unknown modal state ignored"
      );
      return { counted: false };
    }

    const todayIst = resolveDateIst(now);
    let counted = false;

    if (input.action === "viewed") {
      counted = await this.repo.advanceLedger({
        userId: input.userId,
        modalKey: input.modalKey,
        triggerSource: input.triggerSource,
        todayIst,
        rolled: state.lastShownDateIst !== todayIst,
      });
    }

    await this.repo.appendImpression({
      userId: input.userId,
      modalKey: input.modalKey,
      triggerSource: input.triggerSource,
      action: input.action,
      dismissMethod: input.dismissMethod,
      // The number this impression is ABOUT. On a counted view that is the show
      // just taken; on a click or dismissal it is the show already standing.
      showNumber: input.action === "viewed" && counted ? state.showCount + 1 : state.showCount,
      lastOutcomeModule: state.lastOutcomeModule,
    });

    return { counted };
  }
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm nx test api --configuration=unit -- modals.service
pnpm nx typecheck api
```
Expected: PASS — 25 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/core/modals/services
git commit -m "feat(api): modal impression ledger with IST day rollover [TAM-174]

Only a viewed impression advances the count — a click and a dismissal happen
to a modal already shown, and counting them would spend two of three lifetime
shows on one appearance.

The advance is a conditional update whose affected-row count is the authority,
so a double-fired viewed cannot count twice."
```

---

# Phase 4 — wiring

---

### Task 10: The Prisma repository

**Files:**
- Create: `apps/api/src/core/modals/repositories/modals.repository.ts`
- Create: `apps/api/src/core/modals/repositories/index.ts`

**Interfaces:**
- Consumes: `ModalsRepositoryPort` from `types.ts` (Task 5).
- Produces: `class ModalsRepository implements ModalsRepositoryPort`.

There is no unit test here — repositories are proven by the integration suite in
Task 12, which is this repo's convention.

- [ ] **Step 1: Write the repository**

Create `apps/api/src/core/modals/repositories/modals.repository.ts`:

```ts
import type { Prisma } from "@prisma/client";
import { getPrisma } from "@api/shared/database";
import type {
  ModalContentMap,
  ModalHookInput,
  ModalImpressionAction,
  ModalDismissMethod,
  ModalStateRow,
  ModalsRepositoryPort,
} from "@api/core/modals/types";

/**
 * Modals repository — the ONLY place `@prisma/client` is reached for this
 * module.
 */
export class ModalsRepository implements ModalsRepositoryPort {
  /**
   * Claims one webhook delivery. `false` means "already seen".
   *
   * `task_id` is the primary key, so the insert either wins or conflicts; the
   * conflict IS the deduplication and needs no read-then-write race.
   */
  async recordDelivery(
    input: Parameters<ModalsRepositoryPort["recordDelivery"]>[0]
  ): Promise<boolean> {
    const created = await getPrisma().modalHookDelivery.createMany({
      data: [
        {
          taskId: input.taskId,
          action: input.action,
          origin: input.origin,
          userId: input.userId,
          modalKey: input.modalKey,
          sourceEventName: input.sourceEventName,
          audienceId: input.audienceId,
          campaignId: input.campaignId,
          applied: input.applied,
        },
      ],
      skipDuplicates: true,
    });
    return created.count === 1;
  }

  async findState(
    userId: string,
    modalKey: string,
    triggerSource: string
  ): Promise<ModalStateRow | null> {
    const row = await getPrisma().modalUserState.findUnique({
      where: { userId_modalKey_triggerSource: { userId, modalKey, triggerSource } },
    });
    return row ? toStateRow(row) : null;
  }

  async upsertArm(input: ModalHookInput): Promise<void> {
    const armed = {
      surface: input.surface,
      content: (input.content ?? {}) as Prisma.InputJsonValue,
      armedAt: input.occurredAt,
      lastOutcomeModule: input.sourceEventName,
      audienceId: input.audienceId,
      audienceName: input.audienceName,
      campaignId: input.campaignId,
      // Caps ride the webhook so a new modal needs no deploy. Defaulted here
      // rather than in the schema alone, because a campaign that omits them
      // should get the documented defaults, not whatever a previous arm left.
      maxLifetime: input.maxLifetime ?? 3,
      maxPerDay: input.maxPerDay ?? 1,
    };
    await getPrisma().modalUserState.upsert({
      where: {
        userId_modalKey_triggerSource: {
          userId: input.userId,
          modalKey: input.modalKey,
          triggerSource: input.triggerSource,
        },
      },
      create: {
        userId: input.userId,
        modalKey: input.modalKey,
        triggerSource: input.triggerSource,
        ...armed,
      },
      // Deliberately does NOT touch haltedAt, showCount, shownTodayCount or
      // lastShownDateIst: a re-arm refreshes the offer, it does not rewind the
      // ledger or revive a halted modal.
      update: armed,
    });
  }

  /**
   * Halts every row for this `(user, modal)`, whatever its trigger source, and
   * creates one when none exists.
   *
   * Two statements rather than one upsert, because the halt spans rows the
   * unique key cannot address: `updateMany` covers every existing trigger
   * source, and the upsert guarantees at least the named one exists — which is
   * the case that matters when a halt arrives before any arm.
   */
  async applyHalt(input: ModalHookInput): Promise<void> {
    const prisma = getPrisma();
    await prisma.$transaction(async (tx) => {
      await tx.modalUserState.upsert({
        where: {
          userId_modalKey_triggerSource: {
            userId: input.userId,
            modalKey: input.modalKey,
            triggerSource: input.triggerSource,
          },
        },
        create: {
          userId: input.userId,
          modalKey: input.modalKey,
          triggerSource: input.triggerSource,
          haltedAt: input.occurredAt,
          haltedReason: input.sourceEventName,
        },
        update: {},
      });
      await tx.modalUserState.updateMany({
        // Set-once: a row already halted keeps its original timestamp, so the
        // second of two halt paths firing is a genuine no-op.
        where: { userId: input.userId, modalKey: input.modalKey, haltedAt: null },
        data: { haltedAt: input.occurredAt, haltedReason: input.sourceEventName },
      });
    });
  }

  async clearArm(userId: string, modalKey: string, triggerSource: string): Promise<void> {
    await getPrisma().modalUserState.updateMany({
      where: { userId, modalKey, triggerSource, haltedAt: null },
      data: { armedAt: null },
    });
  }

  /**
   * The one indexed read on the Home path.
   *
   * BOTH caps are expressed here, not just the daily one, and that is NOT an
   * optimisation over the service's own gate. `findFirst` returns a single
   * candidate, so a row this clause lets through and the service then rejects
   * does not fall back to the next eligible row — it becomes "no modal". A
   * lifetime-exhausted row sorting first would therefore HIDE a servable one,
   * which is reachable as soon as a user has two rows on one surface (a second
   * modal key, or `first_time` beside `post_outcome`).
   *
   * The service re-checks every predicate anyway, because that is where the
   * rules are unit-testable.
   */
  async findServable(
    userId: string,
    surface: string,
    todayIst: string
  ): Promise<ModalStateRow | null> {
    const row = await getPrisma().modalUserState.findFirst({
      where: {
        userId,
        surface,
        haltedAt: null,
        armedAt: { not: null },
        showCount: { lt: getPrisma().modalUserState.fields.maxLifetime },
        OR: [
          { lastShownDateIst: null },
          { lastShownDateIst: { not: todayIst } },
          { shownTodayCount: { lt: getPrisma().modalUserState.fields.maxPerDay } },
        ],
      },
      orderBy: { armedAt: "desc" },
    });
    return row ? toStateRow(row) : null;
  }

  /**
   * Advances the ledger, conditionally.
   *
   * `updateMany` rather than `update`, because the affected-row count is the
   * authority on whether this show really counted — the trick
   * `AudienceMembership` uses to keep `userCount` exact under concurrency. The
   * `showCount < maxLifetime` predicate is what makes a double-fired `viewed`
   * safe at the last allowed show.
   */
  async advanceLedger(input: {
    userId: string;
    modalKey: string;
    triggerSource: string;
    todayIst: string;
    rolled: boolean;
  }): Promise<boolean> {
    const prisma = getPrisma();
    const result = await prisma.modalUserState.updateMany({
      where: {
        userId: input.userId,
        modalKey: input.modalKey,
        triggerSource: input.triggerSource,
        haltedAt: null,
        armedAt: { not: null },
        showCount: { lt: prisma.modalUserState.fields.maxLifetime },
      },
      data: {
        showCount: { increment: 1 },
        lastShownAt: new Date(),
        lastShownDateIst: input.todayIst,
        ...(input.rolled ? { shownTodayCount: 1 } : { shownTodayCount: { increment: 1 } }),
      },
    });
    return result.count === 1;
  }

  async appendImpression(input: {
    userId: string;
    modalKey: string;
    triggerSource: string;
    action: ModalImpressionAction;
    dismissMethod: ModalDismissMethod | null;
    showNumber: number;
    lastOutcomeModule: string | null;
  }): Promise<void> {
    await getPrisma().modalImpression.create({ data: input });
  }
}

/** Prisma row → domain row. `content` is `Json`, which Prisma types as unknown. */
function toStateRow(row: {
  userId: string;
  modalKey: string;
  triggerSource: string;
  surface: string | null;
  content: Prisma.JsonValue;
  armedAt: Date | null;
  lastOutcomeModule: string | null;
  showCount: number;
  shownTodayCount: number;
  lastShownDateIst: string | null;
  maxLifetime: number;
  maxPerDay: number;
  haltedAt: Date | null;
}): ModalStateRow {
  return {
    userId: row.userId,
    modalKey: row.modalKey,
    triggerSource: row.triggerSource,
    surface: row.surface,
    content: asContentMap(row.content),
    armedAt: row.armedAt,
    lastOutcomeModule: row.lastOutcomeModule,
    showCount: row.showCount,
    shownTodayCount: row.shownTodayCount,
    lastShownDateIst: row.lastShownDateIst,
    maxLifetime: row.maxLifetime,
    maxPerDay: row.maxPerDay,
    haltedAt: row.haltedAt,
  };
}

/** Anything that is not a plain object reads as "no content", never as a throw. */
function asContentMap(value: Prisma.JsonValue): ModalContentMap {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  return value as unknown as ModalContentMap;
}
```

Create `apps/api/src/core/modals/repositories/index.ts`:

```ts
export { ModalsRepository } from "./modals.repository.js";
```

- [ ] **Step 2: Typecheck, lint, and check the boundary gate**

```bash
pnpm nx typecheck api
pnpm nx lint api
pnpm check:arch-boundaries
```
Expected: PASS. If `prisma.modalUserState.fields` is unavailable in this Prisma
version, replace the two field-comparison predicates with a `$queryRaw`
equivalent and note it in the method's comment — the semantics must not change.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/core/modals/repositories
git commit -m "feat(api): modals Prisma repository [TAM-174]

recordDelivery leans on the task_id primary key — the conflict IS the
deduplication, with no read-then-write race. advanceLedger is an updateMany
whose affected-row count is the authority, so a double-fired viewed cannot
count twice. applyHalt spans every trigger source and upserts, so a halt
arriving before any arm still blocks the future arm."
```

---

### Task 11: Env, schemas, controller, routes, composition root

**Files:**
- Modify: `apps/api/src/shared/config/env.ts`
- Modify: `.env.example`
- Create: `apps/api/src/core/modals/routes/modals.schemas.ts`
- Create: `apps/api/src/core/modals/routes/modals.routes.ts`
- Create: `apps/api/src/core/modals/routes/index.ts`
- Create: `apps/api/src/core/modals/controllers/modals.controller.ts`
- Create: `apps/api/src/core/modals/controllers/index.ts`
- Create: `apps/api/src/core/modals/index.ts`
- Modify: `apps/api/src/modules.ts`
- Create: `apps/api/src/core/modals/routes/__tests__/modals.schemas.test.ts`

**Interfaces:**
- Consumes: `ModalsService` (Tasks 6–9), `ModalsRepository` (Task 10).
- Produces: `initModalsModule(app: FastifyInstance): void`.

- [ ] **Step 1: Write the failing schema test**

Create `apps/api/src/core/modals/routes/__tests__/modals.schemas.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import {
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

  test("defaults origin to event when a v1 dispatch omits it", () => {
    const { origin, ...withoutOrigin } = base;
    const parsed = ModalHookBody.safeParse(withoutOrigin);
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.origin).toBe("event");
  });
});

describe("ModalImpressionBody", () => {
  test("accepts a dismissal with a method", () => {
    const parsed = ModalImpressionBody.safeParse({
      modalKey: "status_intro",
      triggerSource: "post_outcome",
      action: "dismissed",
      dismissMethod: "cross",
    });
    expect(parsed.success).toBe(true);
  });

  test("rejects an unknown dismiss method", () => {
    const parsed = ModalImpressionBody.safeParse({
      modalKey: "status_intro",
      triggerSource: "post_outcome",
      action: "dismissed",
      dismissMethod: "swipe",
    });
    expect(parsed.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm nx test api --configuration=unit -- modals.schemas
```
Expected: FAIL — cannot resolve `../modals.schemas.js`.

- [ ] **Step 3: Write the schemas**

Create `apps/api/src/core/modals/routes/modals.schemas.ts`:

```ts
import { z } from "zod";
import { localeQuery } from "@api/shared/schemas/locale";

/**
 * Zod schemas for the generalized modal module (TAM-174).
 *
 * The hook body is snake_case because it is the campaign platform's wire shape,
 * not ours; the two app-facing routes are camelCase like every other route here.
 */

export const ModalContentEntrySchema = z
  .object({
    title: z.string(),
    body: z.string().optional(),
    imageUrl: z.string().optional(),
    ctaText: z.string(),
    ctaDeeplink: z.string(),
  })
  .meta({ id: "ModalContentEntry" });

/**
 * The campaign webhook body.
 *
 * `.loose()` and permissive by design: a vendor-side field addition must never
 * 400 a webhook, because dispatch treats a 4xx as PERMANENT — one attempt, no
 * retry, the arm silently lost.
 *
 * DELIBERATELY UNNAMED — no `.meta({ id })`. `hide: true` hides the route's
 * PATH; a NAMED Zod schema is still published into `components.schemas` of both
 * emitted documents, and the Dart generator emits a model per schema there — so
 * naming this would ship the webhook payload shape inside the Android APK. The
 * `ProviderCallbackBody` precedent this mirrors is unnamed for the same reason.
 */
export const ModalHookBody = z
  .looseObject({
    modal_key: z.string().min(1).max(64),
    action: z.enum(["arm", "halt"]),
    trigger_source: z.string().min(1).max(64),
    surface: z.string().min(1).max(64).optional(),
    max_lifetime: z.coerce.number().int().positive().max(100).optional(),
    max_per_day: z.coerce.number().int().positive().max(100).optional(),
    content: z.record(z.string(), ModalContentEntrySchema).optional(),

    // `z.uuid()`, the Zod 4 top-level form this repo uses everywhere — NOT the
    // deprecated `z.string().uuid()`. It accepts UUIDv7, which is what
    // `User.id @default(uuid(7))` produces.
    user_id: z.uuid(),
    task_id: z.string().min(1).max(128),
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
    dismissMethod: z.enum(["cross", "back", "outside_tap"]).optional(),
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
```

- [ ] **Step 4: Run the schema test to verify it passes**

```bash
pnpm nx test api --configuration=unit -- modals.schemas
```
Expected: PASS.

- [ ] **Step 5: Add the env var**

In `apps/api/src/shared/config/env.ts`, beside the `ABTEST_*` block:

```ts
    // ---- TAM-174: generalized modal webhooks -----------------------------
    // The shared secret the audience-campaign service presents on
    // POST /internal/modals/hooks. UNSET is the valid "this environment
    // receives no campaign webhooks" state and the route is then NOT
    // REGISTERED AT ALL — a 404 rather than an endpoint that accepts anonymous
    // callers, matching how the estate's other machine callbacks behave.
    MODAL_HOOK_KEY: z.string().default(""),
```

and in `.env.example`:

```bash
# --- apps/api generalized modals (TAM-174) ---
# Shared secret presented by the audience-campaign service on
# POST /internal/modals/hooks. Unset => the route is not registered.
# MODAL_HOOK_KEY=<generate with: openssl rand -hex 32>
```

- [ ] **Step 6: Write the controller**

Create `apps/api/src/core/modals/controllers/modals.controller.ts`:

```ts
import { timingSafeEqual } from "node:crypto";
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
      taskId: body.task_id,
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
```

Create `apps/api/src/core/modals/controllers/index.ts`:

```ts
export { ModalsController } from "./modals.controller.js";
```

- [ ] **Step 7: Write the routes**

Create `apps/api/src/core/modals/routes/modals.routes.ts`:

```ts
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { authMiddleware } from "@api/core/auth/middleware";
import { loadEnv } from "@api/shared/config";
import { createModuleLogger } from "@api/shared/logs";
import { ModalsController } from "@api/core/modals/controllers";
import type { ModalsService } from "@api/core/modals/services";
import {
  ErrorEnvelope,
  ModalHookBody,
  type ModalHookBodyInput,
  ModalHookResponse,
  ModalImpressionBody,
  type ModalImpressionBodyInput,
  ModalImpressionResponse,
  ModalsNextQuery,
  type ModalsNextQueryInput,
  ModalsNextResponse,
} from "./modals.schemas.js";

const log = createModuleLogger("modals:routes");

export const MODAL_HOOK_ROUTE = "/internal/modals/hooks";

/**
 * Registers the modal routes.
 *
 * Two app-facing routes under `/modals`, and one machine callback that is
 * registered ONLY when a secret is configured — an unconfigured environment
 * 404s rather than exposing an endpoint that anyone reaching the ALB could POST
 * to.
 */
export function registerModalsRoutes(app: FastifyInstance, service: ModalsService): void {
  const controller = new ModalsController(service);
  const r = app.withTypeProvider<ZodTypeProvider>();

  /**
   * The campaign webhook. PUBLIC — the caller is a machine with no JWT —
   * authenticated by a shared secret inside the controller, exactly as the
   * payment provider callbacks authenticate per gateway.
   *
   * `hide: true` keeps this out of BOTH `openapi.json` and
   * `openapi.public.json`. That matters concretely: the Dart generator emits a
   * model per schema in the document, so without it the webhook payload shape
   * would ship inside the Android APK. It cannot instead be tagged `admin` —
   * the tag⇔path invariant hard-fails an `admin`-tagged route not under
   * `/admin/`.
   */
  if (loadEnv().MODAL_HOOK_KEY) {
    r.post(
      MODAL_HOOK_ROUTE,
      {
        schema: {
          hide: true,
          body: ModalHookBody,
          response: { 200: ModalHookResponse, 401: ErrorEnvelope, 500: ErrorEnvelope },
        },
      },
      async (
        req: FastifyRequest<{ Body: ModalHookBodyInput }>,
        reply: FastifyReply
      ): Promise<void> => {
        await controller.hook(req, reply);
      }
    );
  } else {
    log.debug("MODAL_HOOK_KEY unset — campaign webhook route not registered");
  }

  r.get(
    "/modals/next",
    {
      schema: {
        querystring: ModalsNextQuery,
        response: {
          200: ModalsNextResponse,
          400: ErrorEnvelope,
          401: ErrorEnvelope,
          500: ErrorEnvelope,
        },
      },
      preHandler: authMiddleware,
    },
    async (
      req: FastifyRequest<{ Querystring: ModalsNextQueryInput }>,
      reply: FastifyReply
    ): Promise<void> => {
      await controller.next(req, reply);
    }
  );

  r.post(
    "/modals/impressions",
    {
      schema: {
        body: ModalImpressionBody,
        response: {
          200: ModalImpressionResponse,
          400: ErrorEnvelope,
          401: ErrorEnvelope,
          500: ErrorEnvelope,
        },
      },
      preHandler: authMiddleware,
    },
    async (
      req: FastifyRequest<{ Body: ModalImpressionBodyInput }>,
      reply: FastifyReply
    ): Promise<void> => {
      await controller.impression(req, reply);
    }
  );
}
```

Create `apps/api/src/core/modals/routes/index.ts`:

```ts
export { registerModalsRoutes, MODAL_HOOK_ROUTE } from "./modals.routes.js";
```

- [ ] **Step 8: Write the composition root and register the module**

Create `apps/api/src/core/modals/index.ts`:

```ts
import type { FastifyInstance } from "fastify";
import { createModuleLogger } from "@api/shared/logs";
import { ModalsRepository } from "@api/core/modals/repositories";
import { ModalsService } from "@api/core/modals/services";
import { registerModalsRoutes } from "@api/core/modals/routes";

const log = createModuleLogger("modals:bootstrap");

/**
 * Composition root for the generalized modal module (TAM-174).
 *
 * No cross-module facade is published: nothing else in the API asks about
 * modals, and the module deliberately reads no other module's data — in
 * particular NOT `UserStatusProfile`, because having a name and photo saved is
 * not the halt condition. Only an actual share is.
 */
export function initModalsModule(app: FastifyInstance): void {
  const repo = new ModalsRepository();
  const service = new ModalsService(repo);

  void app.register((scoped) => {
    registerModalsRoutes(scoped, service);
  });

  log.info("modals module initialised");
}
```

In `apps/api/src/modules.ts`, add the import beside the others and call it near
the other no-dependency modules (it resolves no facade, so ordering is free):

```ts
import { initModalsModule } from "@api/core/modals";
// …
  // TAM-174: generalized modals. No cross-module deps — it is armed by an
  // external webhook and read by the app.
  initModalsModule(app);
```

- [ ] **Step 9: Run the full unit suite, typecheck, lint and boundaries**

```bash
pnpm nx test api --configuration=unit
pnpm nx typecheck api
pnpm nx lint api
pnpm check:arch-boundaries
```
Expected: all PASS.

- [ ] **Step 10: Commit**

```bash
git add apps/api/src/core/modals apps/api/src/modules.ts \
        apps/api/src/shared/config/env.ts .env.example
git commit -m "feat(api): modal routes, controller and composition root [TAM-174]

GET /modals/next and POST /modals/impressions are JWT-guarded and public in
the contract. POST /internal/modals/hooks is hide:true so its payload shape
never reaches the APK, and is registered ONLY when MODAL_HOOK_KEY is set — an
unconfigured environment 404s rather than accepting anonymous callers.

The key compare tolerates a length mismatch rather than letting
timingSafeEqual throw, which would leak the length and 500 on a wrong key."
```

---

### Task 12: Integration tests against real Postgres

**Files:**
- Create: `apps/api/src/core/modals/routes/__tests__/modals.routes.integration.test.ts`

**Interfaces:**
- Consumes: `initModalsModule`, and the full route surface from Task 11.

- [ ] **Step 1: Write the integration test**

Create the file, following `status.routes.integration.test.ts`'s harness shape:

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import type { FastifyInstance } from "fastify";
import { buildApp } from "@api/app";
import { startTestDb, stopTestDb } from "@api/shared/testing";
import { disconnectPrisma, getPrisma } from "@api/shared/database";
import { clearGlobalServices } from "@api/shared/workspace";
import { resetEnvCache } from "@api/shared/config";
import { initAuthModule } from "@api/core/auth";
import { initModalsModule } from "@api/core/modals";

/**
 * Integration coverage for the generalized modal module (TAM-174) against real
 * Postgres via testcontainers.
 *
 * The unit suite proves the RULES; this proves they survive the database — the
 * conditional-update race, the cross-trigger halt, the unique keys, and the
 * `hide: true` contract guarantee.
 */

const JWT_SECRET = "a-sufficiently-long-secret-for-modal-tests";
const HOOK_KEY = "test-modal-hook-key";
const USER = randomUUID();

let app: FastifyInstance;
let dbUrl: string;

function token(userId = USER): string {
  return jwt.sign({ sub: userId, email: `${userId}@test.local` }, JWT_SECRET, { expiresIn: "1h" });
}

function hookBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    modal_key: "status_intro",
    action: "arm",
    trigger_source: "post_outcome",
    surface: "home",
    max_lifetime: 3,
    max_per_day: 1,
    content: {
      hi: { title: "नाम और फोटो", ctaText: "डालें", ctaDeeplink: "prabhuji://status" },
      en: { title: "Name and photo", ctaText: "Add", ctaDeeplink: "prabhuji://status" },
    },
    user_id: USER,
    task_id: `campaign-delivery-${randomUUID()}`,
    origin: "event",
    source_event_name: "set_wallpaper_result",
    audience_id: 42,
    audience_name: "prabhuji-status-intro",
    campaign_id: 12,
    occurred_at: new Date().toISOString(),
    ...overrides,
  };
}

async function postHook(body: Record<string, unknown>, key = HOOK_KEY) {
  return app.inject({
    method: "POST",
    url: "/internal/modals/hooks",
    headers: { "x-modal-hook-key": key },
    payload: body,
  });
}

async function getNext(surface = "home", locale = "hi") {
  return app.inject({
    method: "GET",
    url: `/modals/next?surface=${surface}&locale=${locale}`,
    headers: { authorization: `Bearer ${token()}` },
  });
}

async function postViewed() {
  return app.inject({
    method: "POST",
    url: "/modals/impressions",
    headers: { authorization: `Bearer ${token()}` },
    payload: { modalKey: "status_intro", triggerSource: "post_outcome", action: "viewed" },
  });
}

beforeAll(async () => {
  dbUrl = await startTestDb();
  process.env.DATABASE_URL = dbUrl;
  process.env.JWT_SECRET = JWT_SECRET;
  process.env.MODAL_HOOK_KEY = HOOK_KEY;
  resetEnvCache();
  clearGlobalServices();

  app = await buildApp();
  initAuthModule(app);
  initModalsModule(app);
  await app.ready();

  await getPrisma().user.create({
    data: { id: USER, email: `${USER}@test.local`, name: "Modal Tester" },
  });
}, 180_000);

afterAll(async () => {
  await app.close();
  await disconnectPrisma();
  await stopTestDb();
});

beforeEach(async () => {
  const prisma = getPrisma();
  await prisma.modalImpression.deleteMany({});
  await prisma.modalHookDelivery.deleteMany({});
  await prisma.modalUserState.deleteMany({});
});

describe("the hook route", () => {
  test("a wrong key is 401", async () => {
    expect((await postHook(hookBody(), "wrong")).statusCode).toBe(401);
  });

  test("a missing key is 401", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/internal/modals/hooks",
      payload: hookBody(),
    });
    expect(res.statusCode).toBe(401);
  });

  // Dispatch is at-least-once AND treats a 4xx as permanent. A duplicate must
  // therefore be a 200 that changes nothing, never a 409.
  test("a repeated task_id is 200 and changes nothing", async () => {
    const body = hookBody();
    expect((await postHook(body)).statusCode).toBe(200);

    const second = await postHook(body);
    expect(second.statusCode).toBe(200);
    expect(second.json().data.applied).toBe(false);
    expect(second.json().data.reason).toBe("duplicate");
    expect(await getPrisma().modalUserState.count()).toBe(1);
  });
});

describe("the full cycle", () => {
  test("arm, serve, view, then null for the rest of the IST day", async () => {
    await postHook(hookBody());

    const first = await getNext();
    expect(first.statusCode).toBe(200);
    expect(first.json().data.modal.showNumber).toBe(1);
    expect(first.json().data.modal.lastOutcomeModule).toBe("set_wallpaper_result");
    expect(first.json().data.modal.localeServed).toBe("hi");

    expect((await postViewed()).json().data.counted).toBe(true);

    const second = await getNext();
    expect(second.json().data.modal).toBeNull();
  });

  test("the lifetime cap stops the fourth show", async () => {
    await postHook(hookBody());
    // Drive the ledger directly to the cap — the alternative is faking the
    // clock across three IST days, which proves nothing this does not.
    await getPrisma().modalUserState.updateMany({
      where: { userId: USER },
      data: { showCount: 3, shownTodayCount: 0, lastShownDateIst: "2020-01-01" },
    });

    expect((await getNext()).json().data.modal).toBeNull();
  });

  test("a concurrent duplicate viewed advances the count by exactly one", async () => {
    await postHook(hookBody());

    const [a, b] = await Promise.all([postViewed(), postViewed()]);
    const counted = [a.json().data.counted, b.json().data.counted].filter(Boolean);

    expect(counted).toHaveLength(1);
    const state = await getPrisma().modalUserState.findFirstOrThrow({ where: { userId: USER } });
    expect(state.showCount).toBe(1);
  });
});

describe("halting", () => {
  test("a halt makes the modal null permanently, and a later arm does not revive it", async () => {
    await postHook(hookBody());
    await postHook(hookBody({ action: "halt", source_event_name: "status_share_result" }));

    expect((await getNext()).json().data.modal).toBeNull();

    const revive = await postHook(hookBody({ task_id: `campaign-delivery-${randomUUID()}` }));
    expect(revive.json().data.reason).toBe("halted");
    expect((await getNext()).json().data.modal).toBeNull();
  });

  // Audience B's whole reason for existing: an EXIT rule cannot fire for a
  // non-member, so the halt must work with no prior arm.
  test("a halt before any arm blocks the future arm", async () => {
    await postHook(hookBody({ action: "halt", source_event_name: "status_share_result" }));

    const arm = await postHook(hookBody({ task_id: `campaign-delivery-${randomUUID()}` }));
    expect(arm.json().data.reason).toBe("halted");
    expect((await getNext()).json().data.modal).toBeNull();
  });

  test("a halt spans every trigger source of the same modal", async () => {
    await postHook(hookBody());
    await postHook(hookBody({ trigger_source: "first_time", task_id: `campaign-delivery-${randomUUID()}` }));

    await postHook(hookBody({ action: "halt", task_id: `campaign-delivery-${randomUUID()}` }));

    const rows = await getPrisma().modalUserState.findMany({ where: { userId: USER } });
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.haltedAt !== null)).toBe(true);
  });

  test("both halt paths firing keeps the first timestamp", async () => {
    await postHook(hookBody());
    const first = new Date("2026-09-11T06:00:00.000Z").toISOString();
    await postHook(hookBody({ action: "halt", occurred_at: first, task_id: `campaign-delivery-${randomUUID()}` }));
    await postHook(
      hookBody({
        action: "halt",
        occurred_at: new Date("2026-09-11T09:00:00.000Z").toISOString(),
        task_id: `campaign-delivery-${randomUUID()}`,
      })
    );

    const state = await getPrisma().modalUserState.findFirstOrThrow({ where: { userId: USER } });
    expect(state.haltedAt?.toISOString()).toBe(first);
  });

  // Dead code for THIS modal, live insurance for the next one.
  test("a cron halt clears the arm without halting", async () => {
    await postHook(hookBody());
    await postHook(
      hookBody({
        action: "halt",
        origin: "cron",
        source_event_name: null,
        task_id: `campaign-delivery-${randomUUID()}`,
      })
    );

    const state = await getPrisma().modalUserState.findFirstOrThrow({ where: { userId: USER } });
    expect(state.haltedAt).toBeNull();
    expect(state.armedAt).toBeNull();
    expect((await getNext()).json().data.modal).toBeNull();
  });
});

/**
 * A separate app instance, because MODAL_HOOK_KEY is read at REGISTRATION time
 * and the suite above sets it once in beforeAll. Building a second app is the
 * only way to observe the unconfigured branch.
 */
describe("an unconfigured environment", () => {
  test("does not register the hook route at all", async () => {
    process.env.MODAL_HOOK_KEY = "";
    resetEnvCache();
    const bare = await buildApp();
    initModalsModule(bare);
    await bare.ready();

    const res = await bare.inject({
      method: "POST",
      url: "/internal/modals/hooks",
      payload: hookBody(),
    });

    // 404, not 401: an endpoint that exists and rejects still tells an attacker
    // it is there. The estate's convention for machine callbacks is to not
    // register them at all.
    expect(res.statusCode).toBe(404);

    await bare.close();
    process.env.MODAL_HOOK_KEY = HOOK_KEY;
    resetEnvCache();
  });
});

describe("the contract", () => {
  test("the hook route is absent from the emitted OpenAPI document", async () => {
    const doc = app.swagger() as { paths: Record<string, unknown> };
    expect(Object.keys(doc.paths)).not.toContain("/internal/modals/hooks");
    expect(Object.keys(doc.paths)).toContain("/modals/next");
  });
});
```

- [ ] **Step 2: Run the integration suite**

```bash
docker compose up -d
pnpm nx test api --configuration=integration -- modals.routes
```
Expected: all PASS. If `app.swagger()` is unavailable on the injected instance,
assert against the emitted `apps/api/openapi.json` after Task 13 instead and move
that one test there.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/core/modals/routes/__tests__
git commit -m "test(api): modal integration coverage against real Postgres [TAM-174]

Covers the duplicate-task_id 200, the full arm/serve/view/null cycle, the
concurrent-viewed race resolving to exactly one count, the halt before any arm
(audience B's path), the cross-trigger halt, halt idempotency, the cron branch
clearing without halting, and the hide:true contract guarantee."
```

---

# Phase 5 — contract, infra, and evidence

---

### Task 13: Regenerate the contract chain and run the full gate

**Files:**
- Modify: `apps/api/openapi.json`, `apps/api/openapi.public.json` (generated)
- Modify: `packages/api-client/src/types.ts` (generated — never hand-edit)
- Modify: `apps/mobile/lib/**` generated Dart models

- [ ] **Step 1: Regenerate, in order**

```bash
pnpm nx run api:openapi
pnpm nx run api-client:generate
pnpm nx run mobile:generate   # needs JDK 17
```

- [ ] **Step 2: Verify the hook route leaked into neither document**

```bash
grep -c "internal/modals/hooks" apps/api/openapi.json apps/api/openapi.public.json
grep -c "ModalHookBody" apps/api/openapi.public.json
```
Expected: `0` for every one of them. A non-zero count means `hide: true` is not
taking effect and the webhook payload shape would ship inside the APK — stop and
fix before continuing.

- [ ] **Step 3: Confirm the app-facing routes DID land**

```bash
grep -c "modals/next" apps/api/openapi.public.json
```
Expected: at least `1`.

- [ ] **Step 4: Run the whole gate**

```bash
pnpm verify
pnpm nx test api --configuration=integration
```
Expected: both green. `pnpm verify` includes `check:arch-boundaries` and
`check:openapi`, which is what proves the generated artifacts are committed and
current.

- [ ] **Step 5: Commit**

```bash
git add apps/api/openapi.json apps/api/openapi.public.json \
        packages/api-client/src/types.ts apps/mobile/lib
git commit -m "chore(contract): regenerate for the modals module [TAM-174]

api:openapi -> api-client:generate -> mobile:generate, in order.
/internal/modals/hooks appears in neither document (hide: true), so the
webhook payload shape never reaches the APK."
```

---

### Task 14: Terraform

**Files:**
- Modify: `infra/terraform/modules/stack/variables.tf`
- Modify: `infra/terraform/modules/stack/secrets-bundle.tf`
- Modify: `infra/terraform/modules/stack/services.tf`
- Modify: `infra/terraform/envs/stage/*.tf` / `terraform.tfvars`
- Modify: `infra/terraform/envs/prod/*.tf`

- [ ] **Step 1: Read the existing pattern before writing anything**

```bash
grep -rn "abtest_tenant_key\|referral_tenant_key" infra/terraform/ | head -20
```
Mirror it exactly — variable declaration, secret-bundle entry, and the service
env wiring are three separate places.

- [ ] **Step 2: Add the variable**

In `infra/terraform/modules/stack/variables.tf`:

```hcl
variable "modal_hook_key" {
  description = "Shared secret the audience-campaign service presents on POST /internal/modals/hooks (TAM-174). Empty leaves the route unregistered."
  type        = string
  default     = ""
  sensitive   = true
}
```

- [ ] **Step 3: Wire it into the secret bundle and the api service env**

Follow whatever shape `abtest_tenant_key` uses in `secrets-bundle.tf` and
`services.tf`, adding `MODAL_HOOK_KEY`.

- [ ] **Step 4: Set it in stage, leave prod unset**

In `infra/terraform/envs/stage/terraform.tfvars`, add it commented out with a
note that it is filled once the campaigns exist:

```hcl
# TAM-174 — generate with `openssl rand -hex 32` and set the same value on the
# audience-campaign campaign messages' x-modal-hook-key header. Until both sides
# have it, the route stays unregistered and arms are simply never delivered.
# modal_hook_key = "<32-byte hex>"
```

Leave `envs/prod` unset — prod has no campaigns yet.

- [ ] **Step 5: Validate**

```bash
cd infra/terraform/envs/stage && terraform init -backend=false && terraform validate && cd -
cd infra/terraform/envs/prod  && terraform init -backend=false && terraform validate && cd -
terraform fmt -check -recursive infra/terraform
```
Expected: both valid, fmt clean.

- [ ] **Step 6: Commit**

```bash
git add infra/terraform
git commit -m "chore(infra): modal_hook_key variable and secret wiring [TAM-174]

Mirrors abtest_tenant_key. Stage documents it commented-out until the
campaigns exist; prod is left unset, which leaves the webhook route
unregistered there."
```

---

## Definition of done

- [ ] Phase 1 merged in `monorepo-saas` and deployed — it is a hard dependency and changes nothing observable on its own.
- [ ] `pnpm verify` green.
- [ ] `pnpm nx test api --configuration=integration` green.
- [ ] `terraform validate` green for both envs, `fmt -check` clean.
- [ ] `/internal/modals/hooks` appears in **neither** OpenAPI document.
- [ ] Platform configuration applied on stage per the spec's §Platform configuration: seven events registered ACTIVE, audiences A and B created, three campaigns created (start them in `DRAFT`, activate deliberately).
- [ ] Stage end-to-end: fire a real `set_wallpaper_result` from a device, confirm a `modal_user_states` row appears with `lastOutcomeModule = "set_wallpaper_result"`, then `GET /modals/next` serves it.
- [ ] Evidence recorded back into `specs/TAM-174-generalized-modal-audience-trigger.md` under §Evidence.

## Out of scope — needs its own ticket

The Flutter side: calling `/modals/next` on cold start, rendering the sheet, the
top-left close button, the CTA opening the Status module, firing the three
analytics events with the server-supplied properties, and reporting the
impression. This plan ends at a working, tested backend.
