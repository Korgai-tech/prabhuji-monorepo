# Reading the analytics warehouse on a request path

**Scope gate — read this before anything else.**

> This pattern applies to **admin-only routes registered through
> `registerAdminRoute`**. A public or mobile request path **must not** use it —
> it reads a Postgres mirror instead (TAM-175). If you are here for a route the
> app calls, stop: you want the mirror pattern, not this one.
>
> **A second consumer of this pattern needs fresh System Architect sign-off.**
> There is exactly one today (`core/status` performance report, TAM-256). The
> long-term risk of approving an exception is that it spreads by copy-paste, so
> the gate is deliberately a person, not a lint rule.

Status: **approved exception**, System Architect, 2026-09-22 (TAM-256).

---

## The rule this sits inside

`core/users/repositories/deity-preference-warehouse.repository.ts` carries the
canonical statement. It is **two invariants**, not one ban:

1. **No public or mobile request path may depend on the warehouse.** The
   rationale is `GET /home/feed`: it is the app's cold-start screen, ClickHouse
   Cloud is a hosted store over the public internet, and putting it on that path
   adds a warehouse round trip per app open and couples the feed's uptime to the
   warehouse's. **Unchanged and absolute.**
2. **The serving API must boot, and stay ALB-healthy, with zero ClickHouse
   configuration.** Applies to admin paths too, in full force.

An admin report satisfies (1) by construction and must be built to satisfy (2).

## When the exception is justified at all

Only when a Postgres mirror **cannot serve the metric correctly** — not when it
would merely be less fresh. Freshness is a preference a reviewer can overturn;
correctness closes the question.

The worked case: an approximate distinct count (`uniq`) over a **user-selected**
date range. Summing daily uniques over-counts (one person on three days becomes
three), and a roll-up across a group's whole item set is not derivable from
per-item rollups at all. Serving it correctly needs per-day-per-item-per-**user**
grain — i.e. copying the event stream into Postgres — or `uniqState` sketches,
which Postgres cannot merge.

If your metric _is_ a sum or a count, build the mirror. Use this pattern only
when you can name why a rollup is wrong.

## The checklist

All thirteen are conditions of the approval, not suggestions.

1. **Restate, don't reverse.** Name the two invariants wherever the rule is
   documented; never describe this as "reversing" TAM-175. That wording teaches
   the next reader the rule is soft.
2. **Guard the scope with a test.** `arch-boundaries.json` can enforce
   "ClickHouse only inside `repositories/`" but **cannot** enforce "admin only".
   Add an import-graph test asserting the warehouse repository is imported by
   exactly its service and its wiring. See
   `core/status/repositories/__tests__/warehouse-import-graph.test.ts`.
3. **Config as OPTIONAL fields in `loadEnv()`.** Use the existing
   `optionalSecret()` idiom. Missing config is a typed `unconfigured` outcome —
   never a throw, never a boot failure. Do **not** copy the sync job's throwing
   constructor onto a request path: a job should fail loudly, a report must
   degrade.
4. **🔴 Never touch `/health`, and never assert at startup.** `/health` is the
   ALB target-group path (`fargate-service/variables.tf`,
   `unhealthy_threshold = 5`). A schema assertion there turns a warehouse
   outage into every API task deregistering — the mobile app goes down over a
   CMS report's dependency. Put column assertions in an existing scheduled job
   (which already holds credentials and already surfaces as FAILED) and/or as a
   lazy first-query check that maps to the degraded state.
5. **Two-tier, server-enforced timeout.** A client-only timeout abandons the
   socket and leaves the query **running and billed**. Set all four:
   `max_execution_time` (the compute bound, ~10s),
   `cancel_http_readonly_queries_on_client_close: 1`, a wider client
   `request_timeout` (~30s), and a request-scoped `abort_signal`.
6. **Cold start is a state, not an outage.** ClickHouse Cloud idles at ~15
   minutes, so the first query of a session pays wake latency at near-zero
   compute. Surface **three** outcomes — `unconfigured`, `timeout / waking`,
   `unreachable` — and state any p95 target as a **warm** p95 with cold start
   excluded, or the target is unachievable on the first load of every morning.
7. **One lazily-created client, reused.** Never per request (a TLS handshake per
   page load dominates the budget), never at module load (Invariant 2). Close it
   on Fastify `onClose`.
8. **Bound concurrency instead of caching.** In-flight single-flight coalescing
   keyed on the window, plus a hard process-wide cap (2–4). Coalescing is not a
   cache — it retains nothing past the in-flight promise, so it adds no
   staleness. Cover any CSV/export route too; an unbounded export is the most
   expensive thing on the surface.
9. **No sort or pagination pushdown.** The aggregate is window-scoped and
   page-independent. Compute it once per window and sort/page the joined result
   in TypeScript, or every header click buys a fresh scan.
10. **Name dedup columns explicitly.** `event_date`, `corrected_time` and
    `synthetic_sequence_time` are `MATERIALIZED` and therefore **absent from
    `SELECT *`** — a `SELECT *` dedup subquery silently drops `event_date` and
    the outer date predicate loses its column.
11. **Degraded ≠ empty.** An undefined ratio renders blank; an unreadable
    warehouse renders "unavailable" with a **non-dismissible** banner. An editor
    must never confuse "nobody did this" with "we could not read it" — and any
    export must **refuse** rather than emit a file of blank metric columns,
    because a downloaded file carries no banner.
12. **Ship a silent-zero canary.** The dominant failure is not a column rename
    (that throws) — it is a rename of a JSON property key or an event-type
    string. Neither errors: the query returns zero, every rate blanks, and the
    page reads as a healthy, quiet catalogue. Return per-event-type row counts
    and flag when the catalogue is non-empty but all counts are zero.
13. **Cost is awake-time, not query count.** ClickHouse Cloud bills active
    compute, so each page load resets the idle timer — an editor working an
    afternoon holds a replica awake for hours. This is also why a short TTL is
    not the lever people assume: it cuts query count, not awake time.

## Reference implementation

- `apps/api/src/core/status/repositories/status.analytics.warehouse.repository.ts`
- `apps/api/src/core/status/services/status.performance.service.ts`
- `apps/api/src/core/status/repositories/__tests__/warehouse-import-graph.test.ts`
- Spec: `specs/TAM-256-status-performance-analytics.md` (decision D-2 and its
  fifteen conditions)

## Known gap this pattern inherits

The live table `saas_events` is **not declared** in `apps/events/db/` — it is
managed outside this repo, so `pnpm nx run events:ch-check` gives **no** drift
protection for the columns a consumer depends on. Condition 12's canary exists
because of this. Adopting the table into the owned migrations is tracked
separately (TAM-257).
