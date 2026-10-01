# App-landing experiments — console setup (TAM-258)

What has to exist in the shared abtesting console before either landing
experiment does anything. **Nothing here is optional**: with no console objects,
`evaluateAbtest` answers `inExperiment: false`, every user lands on Home, and
the feature is inert — which is a safe state to deploy into, and deliberately so.

Both experiments now EXIST in the console — see "The live console rows" below.
Creating or editing them is an **ops action on the shared platform service**,
not something this repo can do: it needs a tenant key that lives in AWS Secrets
Manager (stage) / `secrets.auto.tfvars` (never committed), and the service is
shared with other tenants.

## Prerequisite — is the environment even wired?

| Env | `ABTEST_BASE_URL` | `ABTEST_TENANT_KEY` |
| --- | --- | --- |
| stage | `https://api-monorepo-common-staging.krutyug.ai/abtesting` (set) | from `secrets.auto.tfvars` — **confirm before seeding** |
| prod | `https://api-monorepo-common-production.krutyug.ai/abtesting` (set) | `infra/terraform/envs/prod/terraform.tfvars` marks the A/B pair **deliberately unset**; issue a prod key first |

Half-configured is a deploy defect, not a quiet no-op — `evaluateAbtest` logs a
`warn` when exactly one of the pair is present. Both absent is the valid
"this env resolves in-process" state and stays at debug.

## apiId vs experimentId — which one the code names

The API names **apiIds only**, and never an experimentId. That is deliberate and
matches every other experiment here (`home.shortcut_grid`, `chat.agent`,
`paywall.layout`, `feed.deity_split`):

| | Owned by | Named in code | Lifecycle |
| --- | --- | --- | --- |
| **apiId** | us | **yes** — `landing.constants.ts` | permanent; one per surface, forever |
| **experimentId** | the console | **never** | many per apiId over time; start/stop freely |
| **variant id** | the console | **yes** — must match exactly | per experiment |

So starting, stopping, or replacing a landing experiment needs **no deploy** —
create a new experiment against the same apiId. Naming an experimentId in code
would couple a console object's lifecycle to a release, which is the thing this
split exists to prevent.

**The one thing that must be agreed before the console rows are created** is the
variant ids, because the API compares them exactly. Everything else the console
is free to change.

### The live console rows

| Console name | apiId | Experiment id |
| --- | --- | --- |
| Land ON status | `land-on-status` | `e1eeb4f0-74ec-4391-a9d5-50b7f8a98b0d` |
| Land as UTM | `land_as_utm` | `a1abe8f0-89e6-4dc7-bf65-7c45471e0cea` |

The apiIds are in `landing.constants.ts`, exactly as typed above — including the
mismatched separators (`-` in one, `_` in the other). They are copied
character-for-character on purpose and pinned by a test: the console is the
source of truth for an apiId, and a value "tidied" in code is an experiment that
silently serves control to everyone.

The **experiment ids are recorded but never sent** — `/evaluate` has no such
field, and the service resolves the live experiment for an apiId itself. They
live in `LANDING_EXPERIMENT_IDS` so an operator reading the console can match
the rows up. A stale value there is a stale comment, never a routing bug.

### Naming the arms — you do not have to match a string

`inExperiment: true` includes **control** (its bucket range is part of the
experiment), so something has to separate the arms or there is nothing to
measure against. Two things can, and the API checks them in this order:

1. **The treatment variant's payload names a landing** — `deeplink` for
   `land-on-status`, `landings` for `land_as_utm`. A treatment arm has to say
   where it sends people and control has no reason to carry that, so this
   separates the arms **with no string for the console and the code to agree
   on**. Name the variants whatever you like.
2. **The variant id matches** `status` / `ad_module` — the fallback, for an arm
   seeded bare with the destinations left to the built-in map.

Both have to miss before a treatment user is read as control. **Setting the
payload is the recommended route**: it is one field you were going to fill in
anyway, it is visible in the console, and it makes the variant ids irrelevant.

> ⚠️ If you seed the arms bare AND name them something other than `status` /
> `ad_module`, treatment reads as control. That failure hides — the console
> shows a running experiment with normal exposures and zero effect. Either set
> the payload, or change the two constants in `landing.constants.ts`.

## The wire contract

What the API sends and what it must get back. Anything else — a timeout, a 5xx,
an HTML error page, `bucket: -1`, a body that fails the schema — collapses to
"no answer", which means Home.

**Request** (`POST <ABTEST_BASE_URL>/evaluate`)

```jsonc
// headers: x-tenant-id: prabhuji, x-tenant-key: <ABTEST_TENANT_KEY>
{
  "subjectId":  "<user uuid>",      // the USER ID, same subject as every other apiId here
  "apiId":      "land_as_utm",
  "appVersion": "1.2.0"             // from the client's app_version header
}
```

`subjectId` is the user id — the same subject `home.shortcut_grid`,
`chat.agent`, `paywall.layout` and `fetchSubjectBucket` all use. That is what
makes the `bucket_id` stamped on `bk_account_created` at signup the number that
decides this experiment too, so a cohort can be read from the warehouse without
joining anything.

**Response — treatment**

```jsonc
{
  "inExperiment": true,
  "bucket": 967,
  "variant": {
    "id": "ad_module",                    // MUST match exactly; anything else = control
    "payload": {                          // optional
      "landings": {
        "STS": "prabhuji://status",
        "RTG": "prabhuji://ringtone/019f5f4c-…"
      }
    }
  }
}
```

For `land-on-status` the payload key is a bare `deeplink` instead:

```jsonc
{ "inExperiment": true, "bucket": 921,
  "variant": { "id": "status", "payload": { "deeplink": "prabhuji://status" } } }
```

**Response — control / outside every range**

```jsonc
{ "inExperiment": false, "bucket": 31, "defaultConfig": null }
```

Both read as Home. Unlike `chat.agent` and `paywall.layout`, **`defaultConfig` is
not consulted at all** for these two apiIds: those surfaces have a sensible
in-process fallback, and this one does not — the experiment IS the bucket
ranges, which live only in the console. "Outside the experiment" and "the console
said nothing" are the same answer here, and it is today's behaviour.

**Response — the service's own fail-soft**

```jsonc
{ "inExperiment": true, "bucket": -1, ... }
```

`bucket: -1` is the service's "I could not really evaluate" marker. The client
treats it as no answer. See `abtest.client.ts`.

## The two experiments

Two apiIds, not one four-arm experiment: they start, stop and get read
independently, and the bucket ranges are disjoint so no subject is ever in both.

### 1. `land-on-status` — the standing landing

| | |
| --- | --- |
| **apiId** | `land-on-status` |
| **Control** | buckets **0–49** — no variant, or any variant id other than the one below |
| **Treatment** | buckets **900–949**, variant id **`status`** |
| **Targeting** | app version **>= 1.2.0** |
| **Variant payload** | *(optional)* `{ "deeplink": "prabhuji://status" }` |

Treatment lands the user inside Status on **every** app open. The payload is
optional — omit it and the API serves its built-in `prabhuji://status`. Set it to
point this arm somewhere else without an API deploy.

### 2. `land_as_utm` — the one-time ad arrival

| | |
| --- | --- |
| **apiId** | `land_as_utm` |
| **Control** | buckets **50–99** |
| **Treatment** | buckets **950–999**, variant id **`ad_module`** |
| **Targeting** | app version **>= 1.2.0** |
| **Variant payload** | *(optional)* `{ "landings": { "STS": "prabhuji://status", "RTG": "prabhuji://ringtone" } }` |

Treatment lands the user inside the module their **install ad** named, **once**.
The API spends a per-user marker (`users.ad_landing_consumed_at`) the first time
it actually serves a non-Home landing; from the second open they get Home.

The payload is where new landing destinations are added — **this is the reason
the contract carries a deep link and not a destination name**. Adding a code, or
pointing an existing code at one specific item
(`"RTG": "prabhuji://ringtone/<id>"`), is a console edit with no API deploy and
no app release.

## Rules the API enforces regardless of the console

These are deliberate belt-and-braces. A console misconfiguration cannot route
anyone somewhere their build cannot render.

1. **Variant ids must match exactly.** Any id other than `status` / `ad_module`
   reads as control → Home. A renamed variant therefore **fails safe** (everyone
   to Home), never into a wrong arm.
2. **App version >= 1.2.0 is re-checked in code.** The targeting rule above is
   belt; `LANDING_MIN_APP_VERSION` is braces. A build below the floor has no
   `status`/`ringtone` route at all.
3. **Registration cohort.** Users whose first successful OTP verify predates
   `LANDING_EXPERIMENT_START_AT` are excluded — *not* counted as control. This is
   checked **before** the service is called, so an excluded user costs the launch
   path zero round trips.
4. **Every deep link is validated** — `prabhuji://` scheme only, slug-shaped
   host, no credentials. A console payload is operator input that reaches the
   client as a navigation instruction; an `https://` or `javascript:` value is
   ignored and the built-in map answers instead.

## What the app can open

Bare module links now parse (TAM-259) — `prabhuji://status` opens the Status
tab, `prabhuji://ringtone` the ringtone grid. Same for `aarti`, `mantra`,
`book`, `horoscope`, `wallpaper`. Id-carrying links open the item.

A slug the build does not know (`prabhuji://newthing`) parses to
`UnknownDeepLink` and lands on Home, so a console serving a destination a given
release predates degrades correctly with no client change.

⚠️ Still blocked on the rest of TAM-259: nothing reads `landing` off
`/users/me` yet, so seeding the experiments today routes nobody.

**Free vs Pro matters when choosing a destination.** `prabhuji://ringtone` is the
module's free grid; `prabhuji://ringtone/<id>` is the **Pro-only** preview. An ad
landing every arrival on a Pro screen will meet a paywall.

## Order of operations

0. Confirm TAM-259 has shipped (see the warning above) and the release is >= 1.2.0.
1. Confirm `ABTEST_TENANT_KEY` is set for the env (and that it is a **runtime**
   key — `/evaluate` and `/bucket-space` take runtime; only `/test-subjects`
   needs an admin key).
2. Set `LANDING_EXPERIMENT_START_AT` to the real launch date. It defaults to the
   placeholder in `landing.constants.ts`; an unparseable value falls back to the
   same default, never to "no gate".
3. Create the two apiIds and their experiments with the ranges above.
4. Confirm the real UTM codes. `STS` / `RTG` are **placeholders**; matching is on
   whole delimited tokens (`prabhuji_STS_hi` ✓, `ARTISTS_2026` ✗ — deliberately
   not a substring match).
5. Pin a QA account to bucket 920 and another to 970 from the CMS (TAM-187
   test-user pinning) and walk both arms on a real device.

## Verifying without the console

`tmp/`-local only, but the shape is worth keeping: a 40-line HTTP stub answering
`POST /abtesting/evaluate` from a JSON file lets one running API be walked
through every arm without touching the shared service. That is how TAM-258's
local verification was done — see the spec's "Local verification" table.
