# Feed rotation (TAM-150)

The home feed and the module grids used to order by `id ASC` forever — the per-item `sort_order`
columns were deliberately dropped, and no new content is landing for a while. The app read stale.
Rotation makes the order change twice a day using only the catalogue we already have.

## The one idea: a refresh epoch, not a scheduler

    epoch = floor((now + 5:30) / 12h)      // ticks at 00:00 and 12:00 IST

The 12h interval is the default, not a hardcoded constant: `FEED_REFRESH_INTERVAL_MS` overrides it
(bounded 1 minute .. 1 day, validated in `shared/config/env.ts`, and again in Terraform so a bad
value fails the plan instead of crash-looping the task). **Prod leaves it unset** — the default IS
the production schedule, and `envs/prod/main.tf` deliberately does not pass it — the schedule that matters lives in one place.
**Stage runs at 5 minutes permanently** (`envs/stage/terraform.tfvars`), because a refresh you have
to wait until midnight to see is a refresh nobody tests; the old way was editing the constant, and
that shipped to prod once and had to be reverted.

Two ways stage therefore does not behave like prod, both consequences of the interval rather than
bugs: the new-item boost window is `NEW_BOOST_CYCLES` refreshes, so a fresh upload holds its
guaranteed top slot for **20 minutes on stage against ~2 days on prod**; and
`bk_feed_refresh_triggered` fires **288 times a day on stage against twice on prod**, so filter on
environment before reading refresh counts out of the staging warehouse.

The displayed order is a **pure function of `(epoch, catalogue)`**. Nothing schedules anything:
the first request after a boundary computes the new order and every request after that reuses it.
No cron, no `feed_rotation` table, no failure mode where a missed job freezes the feed.

Code: `apps/api/src/shared/rotation/` — `rotation.ts` (pure algorithm + knobs), `plan-cache.ts`
(the two-level cache below), `page.ts` (`rotationPage`, the four-step page helper every surface
calls), `weave.ts` (the TAM-175 deity slot maps).

## One plan per refresh, shared across tasks

Determinism means every task *would* compute the same order — but only if it reads the same
catalogue, and at 00:00 they don't read it at the same instant. A CMS write landing between two
tasks' reads leaves them with plans differing by one item, and a user whose page 1 and page 2 land
on different tasks then sees an item repeated or skipped at that seam. So the plan is built once
and published:

    L1  in-process LRU (600 entries, 2-cycle TTL, promise-cached)  ← steady state, zero I/O
    L2  Redis `feed:plan:<surface>:<filters>:<epoch>` (2-cycle TTL) ← shared by the whole service
        guarded by `feed:plan:lock:...` (SET NX PX 15s, token-guarded release)

First task after the boundary takes the lock, reads the catalogue, publishes the id list. The rest
poll for up to 3s and read it. One catalogue read per refresh for the entire service, and one
`bk_feed_refresh_triggered` event.

**Redis is never load-bearing.** Disabled (`ENABLE_REDIS=false`, the local-dev default),
unreachable, lock contention, wait timeout, malformed value, publish failure — every path falls
through to building from Postgres, which is a *correct* answer precisely because the function is
deterministic. An outage costs duplicate work, never a broken or empty feed. The lock mirrors
`core/payment/services/billing-lock.ts`, including the compare-and-delete release (an expired
holder must never delete its successor's lock).

Every Redis call here is capped at **200 ms** (`withTimeout`). This is not belt-and-braces: the
shared client in `shared/database/redis.ts` runs ioredis defaults, so against an unreachable server
a `GET` is *queued and retried for seconds* rather than refused — a Redis brownout would otherwise
stall every feed request that missed L1, which is strictly worse than Redis being off. The cap
lives in this file rather than on the client because OTP, rate limiting and the billing lock share
that client with very different latency tolerances.

The fallback order on a cold read is therefore: **L1 → Redis (≤200 ms) → Postgres.** The catalogue
read is memoised per call (`buildOnce`), so a database outage is never amplified into two queries
by the Redis fallback path.

## What rotation does, per module

Each module rotates over its **own** catalogue — one module's shuffle never affects another's.

1. **Ring** — items sorted by `hash(id)`: a fixed circle, identical at every epoch.
2. **Window** — `SHOW_SHARE` (65%) of the ring starting at `epoch × step`, wrapping. The window is
   longer than the step, so consecutive refreshes share most of their items (~20 of 65 swapped)
   while the union of windows still covers everything within a few days. Catalogues at or under
   `MIN_ROTATE_COUNT` (24) show whole — holding items back would leave the grid looking empty.
3. **Reshuffle** — the window re-sorted by `hash(id + epoch)`, so even the items that stayed moved.
4. **Resurface** — a rotating 2-wide slice of the module's top-20 by engagement, pinned near the
   top as a normal card (no badge). Items with no engagement never resurface. The slice starts at
   `hash(epoch)`, not `epoch × 2`: a linear step of 2 only ever lands on even offsets, so an even
   pool resurfaced the same fixed pairs and a pool of one or two was pinned to one head forever.
   And **three proven items is the minimum** — at or below the slice width every proven item is
   pinned every refresh no matter where the start lands, which is pinning rather than resurfacing,
   so the module resurfaces nothing and they compete in the shuffle like everything else. Both
   rules exist because the top of a young catalogue's grid otherwise never moves, which reads as
   "the refresh is broken" even while the rest of the grid rotates correctly.
5. **New boost** — items published within the last 4 refreshes (~2 days), newest first, capped at
   2, pinned above those. Inert while the catalogue is frozen; live the day uploads resume, and it
   expires on its own — no permanent preference.

The knobs are exported constants in `rotation.ts`, tuned by deploy. There is no DB config and no
admin UI for them until someone actually needs to tune without a deploy.

**Engagement signal per surface:** wallpaper `setCount`; ringtone `playCount + setCount`; home
cards and status have no local counters, so they use the shared engagement table
(`shareCount × 3 + likeCount × 2 + viewCount`) — one batched facade call per epoch, not per request.

## Home feed: rotate, then interleave

`GET /home/feed` rotates each `contentType` over its own catalogue and then interleaves them —
a repeating block with one card of each type, the block order rotating by one per block (and per
epoch). While every type still has stock, no two neighbouring cards share a type.

`HomeSettings.feedTrendingFirst` still bypasses rotation entirely and serves the original
`(trendingScore, id)` keyset. When ops has hand-ranked the feed, a shuffle would fight them.

## Paging: the epoch rides in the cursor

Rotated surfaces page by `{epoch, offset}` instead of a DB keyset. Pinning the epoch in the cursor
is what makes "a refresh never reorders a session already open" true: pages 2..N keep serving the
plan page 1 came from, and the new order lands on the next cold start.

An unreadable cursor (tampered, or the old `{sortOrder, id}` shape from before this shipped)
**restarts the listing instead of 400ing** — an app mid-session across the deploy must not lose a
screen. Ranked surfaces (wallpaper `trending` / `new` / `custom` / `liked`) still keyset-page and
still reject a malformed cursor.

**Content published mid-epoch is invisible until the next refresh** — the plan for the running
epoch was already built and published. This is the same property that makes "the order does not
change under you" true, and the new-boost window (above) guarantees the item lands near the top at
the next 00:00 or 12:00. If an ops workflow ever needs a fresh upload live immediately, that is a
deliberate feature to add (delete the `feed:plan:*` keys for the current epoch on publish), not a
bug in rotation.

## Deity split (TAM-175)

Rotation is unchanged; a **god split** sits on top of it.

The order of a personalised surface depends on the user, and a plan per user
would be a cache entry per user plus a catalogue read per user per refresh. So
the split is layered rather than baked in:

    ROTATION   shared, cached, per POOL      ← unchanged, one build per (pool, epoch) for the fleet
    SLOTTING   per user, per request, pure   ← `shared/rotation/weave.ts`, array indexing over those arrays

**Pools.** Status rotates each deity over its own catalogue — the plan keys
(`status:<deity>:<locale>`) are the SAME ones a deity-chip feed already builds,
so a user's main pool is a plan the whole fleet shares. Home caches one
**bundle** per epoch (`home:bundle:<epoch>`) holding the ordinary mixed feed
plus one rotated list per `(contentType, deity)` — all of it from one catalogue
read, because keying each pool separately would turn one read into dozens.

**Slot maps** are declared as "which slots does each pool own", mirroring the
product spec's table; `slotsFromMap` throws at module load if the numbers do not
tile `1..N` exactly once, so a typo fails the boot instead of quietly serving a
wrong mix.

| Surface | Slots | Map |
|---|---|---|
| `GET /status/feed` (no chip) | 1–20 | main `1,2,3,5,7,9,11,13,15,17` · second `4,10,14,18` · any `6,8,12,16,19,20` |
| `GET /home/feed` | 1–10 | status-main `1,2,5,8` · status-second `3,6` · other-module-main `4,7,9` · any `10` |

Both endpoints' DEFAULT page limits (20 and 10) equal their slot counts, so page
1 is exactly the map. Slot N+1 onwards is the ordinary rotation minus what the
slots already took.

**A deity CHIP feed is not woven** — it is already that god's own list.

**Three rules the tests pin, because each is easy to break by accident:**

1. **An id appears once.** The pools overlap by construction — `any` contains
   everything — so "skip what is already placed" is the whole game.
2. **A spent pool falls through** (`main → second → any`) rather than leaving a
   gap. A user whose second god has three statuses must not get a feed pocked
   with holes at slots 4, 10, 14 and 18.
3. **No preference ⇒ byte-identical to the unpersonalised feed.** Empty pools,
   every slot falls through, output is the plain rotation. This is requirement
   §6 satisfied by construction rather than by a branch — and it is also the
   degraded mode when the preference mirror is stale or the users module is
   unreachable. Neither ever fails the feed.

**The `any` pool is the WHOLE catalogue**, so an "any" slot legitimately serves
a main- or second-god item the map has not reached yet. Filtering it down to
non-deity items would strand content and break rule 2.

### Which users get the split at all (TAM-180)

The split is behind the shared abtesting service, api id `feed.deity_split`
(`shared/rotation/deity-split.experiment.ts`). A user whose bucket lands in a
variant whose payload says `{ "deitySplit": true }` gets the weave; everyone
else — a `deitySplit: false` variant, or outside every bucket range with no api
default — gets the plain rotation. The ladder, top to bottom:

| Rung | Answer |
|---|---|
| `ENABLE_DEITY_SPLIT=false` | rotation; the service is not called, so no exposure is recorded |
| a variant | its payload's `deitySplit`; a payload without the key reads the variant NAME: `control` ⇒ rotation, anything else ⇒ split |
| `inExperiment: false` | the api default's `deitySplit` if it has one, otherwise rotation |
| no answer (unconfigured, timeout, 5xx, fail-soft) | split — today's live behaviour; a null is "no answer", not "outside the range" |

**Control is the empty pair, not a second code path.** Rule 3 above already
guarantees the weave with empty pools is byte-identical to the plain rotation,
so the old algorithm is "skip the preference read and pass `NO_DEITY_PAIR`".

**The service is asked only when the cursor cannot name the pair** — page one,
an unreadable cursor, or one minted before TAM-175. A cursor page reproduces
page one from its pinned `{d1, d2}` (a pinned `null` stays `null`), so it calls
neither the service nor the preference: an arm can never flip a session already
open, and cursor pages are cheaper than they were. The `home_feed` /
`status_feed` log lines carry `feed_algorithm` and `abtest_arm` (`cursor` on a
cursor page). A deity CHIP feed and the `feedTrendingFirst` CMS mode never
evaluate — neither is woven.

### Where the preference comes from

`custom_user_properties` in ClickHouse is the source of truth and stays there.
`GET /home/feed` is the cold-start screen whose page hydrate is ~0.9 ms, and the
warehouse is a hosted analytical store over the public internet — a per-request
lookup would put a round trip on every app open and couple the feed's
availability to the warehouse's.

So a periodic one-off task mirrors five columns into Postgres
(`user_deity_preferences`), and the feed reads only that:

    first_preferred_shared_deity_id  → primary_deity_slug    (MAIN)
    second_preferred_shared_deity_id → secondary_deity_slug  (SECOND)
    ad_god_name                      → ad_deity_slug         (mirrored, unused)
    preferred_shared_deity_source    → source
    updated_at                       → warehouse_updated_at  (also the watermark)

    pnpm nx run api:sync-deity-preferences

Resumable and idempotent: the watermark is `MAX(warehouse_updated_at)` of the
mirror itself and the write is an upsert, so a run that dies halfway resumes
from what actually landed — there is no cursor that can advance past rows which
failed to write.

**`argMax`, not a plain SELECT.** The source is a `SharedMergeTree` ordered by
`user_id`, NOT a replacing engine, so several rows legitimately exist per user
and nothing collapses them; reading rows directly would let an arbitrary one
win.

**Time crosses that boundary as epoch milliseconds, never as text.**
`updated_at` is `DateTime64(3, 'Asia/Kolkata')` and a ClickHouse timestamp
RENDERS in its column timezone — an instant of `10:00Z` comes back as
`"2026-09-17 15:30:00.000"`. Reading that as UTC pushed the watermark 5h30m into
the future and made the next run skip every change inside that window: silent,
permanent data loss. `toUnixTimestamp64Milli` / `fromUnixTimestamp64Milli`
remove the ambiguity. **Do not "simplify" this back to a formatted string.**

### The cursor carries the pair

`{epoch, offset}` became `{epoch, offset, d1?, d2?}`. The order now depends on
the user's gods as well as the epoch, so pages 2..N can only reproduce page 1 if
they know which pair produced it — otherwise a preference changing mid-scroll
(an ad attribution landing) reshuffles everything below the fold, which is the
same failure the epoch is pinned to prevent from a different input.

**The cursor's pair WINS over the request's**, so a change applies on the next
cold start exactly like a refresh does (spec §7). `d1`/`d2` absent means "this
surface is not deity-aware" (ringtone, wallpaper) or "minted before TAM-175" —
both fall back to the current pair, so no cursor in the wild is invalidated, and
those surfaces still mint byte-identical cursors.

### Pins still win

The hardcoded-content overlay is unchanged: the woven array is what goes INTO
`rotationPage`, so pins prepend it and the slot map applies to what is left —
which is exactly what the spec asks for, with no new code.

## Rotated surfaces

| Surface | Rotates | Untouched |
|---|---|---|
| `GET /home/feed` | default mode (per type, then interleaved, then deity-woven) | `feedTrendingFirst` mode |
| `GET /status/feed` | all of it, per `(deity, locale)`; the no-chip "All" tab is deity-woven | a deity chip (already one god's list) |
| `GET /ringtones` | the grid, per `(deity, locale)` | `/ringtones/search?q=` |
| `GET /wallpaper/list`, `GET /wallpaper/home` | the default listing + the `top_live` row | `trending`, `new`, `custom`, `liked` rows |

Aarti and Mantras are deliberately out of scope for TAM-150.

## Analytics

`bk_feed_refresh_triggered` fires once per epoch, when the home plan is built —
`{ refresh_id, refresh_time, content_type_counts }`. The name is declared in
`shared/analytics/events.ts` (`FEED_ANALYTICS_EVENT.REFRESH_TRIGGERED`), which is where every
server-produced event name lives — the payment module's list moved there too, since more than one
module emits now and a module may not import another's constants. The `bk_` prefix marks the
PRODUCER: these come from `apps/api`, not from a phone, and both land in the same ClickHouse table.

It is sent through `shared/analytics/events-client.ts` (the same door the Flutter SDK posts to),
stamped with
`user_id: SYSTEM_ACTOR_ID.FEED_ROTATION` (`00000000-0000-0000-0000-000000000001`) because the
collector drops identity-less events — and it must be a UUID, because `saas_events.user_id` is a
UUID column and ClickPipe silently rejects anything else (the original `"system-feed-rotation"`
lost every refresh event from the `saas_events` move until TAM-188), and with
`insert_id: feed_refresh:<epoch>`. Only the task that wins the build lock emits it, and the
`insert_id` dedupes anyway if a Redis outage lets two tasks build. Best-effort: an analytics
outage never fails a feed read.

## Measured cost

Real Postgres, 10,000 wallpapers, median of 5 runs:

| Query | Median | Runs |
|---|---|---|
| Plan build — whole catalogue, 3 columns | 23.2 ms | twice a day, whole fleet |
| Page hydrate — `WHERE id IN (10)` | **0.9 ms** | per request |
| *(before rotation)* keyset `ORDER BY id LIMIT 11` | 0.7 ms | per request |
| *(rejected)* `ORDER BY md5(id‖seed) LIMIT 10` | 10.4 ms | per request |
| *(rejected)* same, `OFFSET 2000` | 15.6 ms | per request |

Rotation cost the per-request path 0.2 ms — noise — and removed its depth sensitivity, because
paging is now an array slice rather than a keyset walk.

**Do not "optimise" this by pushing the hash into SQL.** It reads like the tidier design, and it is
10–17× slower on every single request: a per-epoch seed cannot be indexed, so Postgres computes
`md5()` over the whole table and sorts it, per request, forever. The current shape trades one 23 ms
scan per refresh for primary-key lookups on every read. That trade is the point.

The one residual cost is a **boundary spike**: the request that wins the lock at 00:00 pays the
build, and requests arriving in that window wait one 50 ms poll. If it ever matters, pre-warm the
next epoch's plan just before the boundary — don't touch the query shape.

## Cost, and the ceiling

Building a plan reads every active row of a module (id + two columns) once per epoch per filter
combination, for the whole service — the same bounded-catalogue assumption
`wallpaper.findAllActiveIds` already makes. At today's few-thousand-row scale that is a
twice-a-day cost. The published plan is a JSON id array; a 5,000-item catalogue is ~185KB in
Redis. If a catalogue ever gets big, push
the hash into SQL (`ORDER BY md5(id || :seed)`) and keyset on it; the `ponytail:` comments in the
repositories mark the spots.
