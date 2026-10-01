# Kuldevta identification and persona chat — design

**Date:** 2026-09-01
**Status:** approved design, pending implementation plan

## 1. What we are building

A family answers six questions about their lineage. We tell them which deity is
their **kuldevta**, and then let them talk to that deity.

Two RAGFlow agents, both called by the Prabhuji API backend, which holds the
assignment between them:

| | Agent | Job |
|---|---|---|
| Stage 1a | `kuldevta-parser` | Parse six free-text answers into a normalised profile |
| Stage 1b | *(backend, not an agent)* | Match profile → kuldevta slug + assignment tier |
| Stage 2 | `kuldevta-persona` | Speak as the assigned deity |

The six questions, and where each answer lands:

1. Apka surname kya he? → `surname`
2. Apka parivar kaha se he? (ancestral, not current) → `ancestral_place`
3. Aap kis samaj se he? → `community`
4. Apka gotra kya he? → `gotra`
5. Apke dada dadi konse mandir jaate the? → `soft_signals.temple_mentioned`
6. Apke ghar ke mandir mein kis devta devi ki photo lagi he? → `soft_signals.mandir_photo`

## 2. Evidence that shaped this design

Recorded because each finding overturned an assumption in the original agent
JSON.

**Retrieval cannot rank this corpus.** A live retrieval against
`Prabhuji-kuldevta` (dataset `17aaa80aa5cf11f18455bf94535108a7`) for a Maratha
family from Satara whose grandparents visited **Jejuri** — the textbook
`khandoba` alias hit — returned:

```
0.723  kalubai.md                 <- wrong, ranked first
0.722  khandoba.md                <- correct, second, by 0.001
0.717  tulja_bhavani.md
0.717  saptashrungi.md
0.716  mahalakshmi_kolhapur.md
0.715  region-defaults/mh.md
```

Every Maharashtra deity scores within 0.009. The documents are structurally
near-identical, so the embedding cannot separate them. With `top_n: 8` over a
74-chunk corpus, a harder case drops the correct deity out of the window
entirely and the agent returns something plausible and wrong.

**The corpus is small enough not to need retrieval.** 33 deity documents and 8
region defaults, 74 chunks total. The matching-relevant fields are a few
thousand tokens.

**Chunk 1 of every deity document is unattributable.** It holds voice, niyam and
mantra but carries neither `deity_id` nor the deity's name. A retrieval landing
there yields a personality that cannot be attributed to a deity.

**Production has no kuldevta storage.** Confirmed against production `app`
(read-only, via SSM tunnel): zero columns matching `kuldev`, `gotra`, `samaj`,
or `ancestral` anywhere in `public`.

**The app's `deities` table is a different concept.** 23 rows — `hanuman`,
`shiva`, `ganesha`, `vitthal`, `ambabai` … — a content-tagging taxonomy with
`icon_url` and `sort_order`, joined by `deity_slug` from `audio_items`,
`mantra_audio_items`, `wallpapers`, `status_items`, `ringtones`. Exact slug
overlap with the kuldevta registry is **zero**. Only three are the same god
under a different slug: `hanuman_ji`/`hanuman`, `vithoba`/`vitthal`,
`mahalakshmi_kolhapur`/`ambabai`.

**A near-homonym trap exists.** Registry `ambaji` (Arasuri Amba, Gujarat) is
NOT app `ambabai` (Mahalakshmi, Kolhapur). Any fuzzy slug matching will merge
them silently.

**30 of 33 kuldevtas have no content in the app.** No wallpaper, no status
image, no aarti, no mantra, no icon.

**The xlsx and the RAGFlow markdown disagree.** The workbook's `ALL` region
default is `kuldevi_anaam` (*"THE TRUE FALLBACK"*); the markdown overrides it to
`hanuman_ji` and deactivates `kuldevi_anaam` for v1. The markdown also carries
`is_active`, `is_fallback` and `human_reviewed`, none of which exist in the
xlsx. Neither is a complete source. See §6.1.

**The registry is an unreviewed draft.** Its README forbids user-facing release
until `human_reviewed` is TRUE by a named reviewer; every row is currently
false. See §6.3.

**A crisis-safety layer already exists** for RAGFlow-served chat in
`apps/api/src/core/chat/` — a `DISTRESS_DETECTED` sentinel plus detection of
Azure content-policy prompt rejections. Stage 2 must route through it.

## 3. Decisions

| # | Decision | Rationale |
|---|---|---|
| D1 | The kuldevta registry becomes tables in the Prabhuji Postgres DB | Matching is a lookup, not a language problem. Deterministic and unit-testable. |
| D2 | Matching moves out of the prompt into backend code | A wrong community mapping is fixed by editing a row, not redeploying a prompt. |
| D3 | Agent 2's persona is injected by the backend, not retrieved | Identity can never be misattributed. See the chunk-1 finding. |
| D4 | The RAGFlow `Prabhuji-kuldevta` dataset leaves the critical path | Consequence of D3: nothing retrieves it, so the registry has exactly one home and cannot drift. |
| D5 | The column is `kuldevta_slug`, never `deity_id`, with no FK to `deities` | The two vocabularies must not be joinable by accident. |
| D6 | v1 result screen is text-only — no kuldevta artwork | 30 of 33 have no art. Registry art is `human_reviewed: false`. Sourcing 33 verified images is a content workstream, not a blocker for shipping. |
| D7 | Both agents stay in `conversational` mode, called via `POST /api/v1/agents/chat/completions` | Matches the deployed agents and the existing chat module's integration. |
| D8 | Archetypes become their own table | Voice direction is shared across deities; editing it should touch one row. |
| D9 | The xlsx is the content source; v1 operational overrides are a separate committed layer | The xlsx and the RAGFlow markdown disagree on the national fallback. See §6.1. |
| D9a | `hanuman_ji` is the `ALL` fallback for v1; `kuldevi_anaam` stays inactive | Confirmed 2026-09-01. The xlsx `ALL` row is the stale one. |
| D9b | `human_reviewed` seeds as **TRUE**; rows are flipped to FALSE as review finds problems | Confirmed 2026-09-01. **This inverts the workbook README's rule** (§6.3), which says nothing reaches a user until a named reviewer sets it TRUE. Accepted deliberately: gating on review would ship almost every family a region default, and the registry's own `confidence` field plus `assignment_tier` already signal weak evidence. Revisit once there is enough traffic to prioritise review by real demand. |
| D10 | The sati prohibition is a backend guardrail, not prompt text | The registry says so explicitly, and it is a criminal-law requirement. See §9.1. |
| D12 | Ship via `TAM-###` branch → `stage` → verify → same branch → `main` | `origin/stage` is 29 commits ahead of `origin/main`; promoting the feature branch to each keeps `main` free of stage-only work. See §11. |

## 4. Data flow

```
App: six answers
  --> POST /kuldevta/identify                            [backend]
        1. RAGFlow kuldevta-parser  --> profile JSON      (parse only, no matching)
        2. matchKuldevta(profile)   --> slug + tier       (pure function over Postgres)
        3. persist user_kuldevta
        <-- { slug, name, temple, tier }

App: chat message
  --> POST /kuldevta/chat                                [backend]
        1. load persona block WHERE slug = user's assignment
        2. RAGFlow kuldevta-persona, persona as Begin inputs, session_id for history
        3. assessAgentTurn(reply)  --> crisis card OR reply
```

The LLM never chooses a deity id. The matcher never reads free text.

## 5. Data model

Prisma, following existing repo conventions: uuid PKs, snake_case `@map`,
per-`(entity, locale)` translation tables rather than JSONB, logical slug refs
without cross-module FKs.

- **`KuldevtaArchetype`** — `id` (`shiva_form`), `name`, `description`,
  `voiceDirection`.
- **`Kuldevta`** — `id` uuid, `slug` unique, `nameRoman`, `nameDevanagari`,
  `gender` (`devi`|`devta`), `archetypeId`, `formOf`, `states[]`,
  `communities[]`, `aliases[]`, `templeName`, `templeVillage`, `templeDistrict`,
  `templeState`, `epithets[]`, `mantra`, `dayObserved`, `festivals[]`,
  `offerings[]`, `niyam[]`, `toneNotes`, `iconography`, `weeklyDay`,
  `confidence` (`high`|`medium`), `notes`, `active`, `isFallback`,
  `personaEnabled`, `humanReviewed`.
- **`KuldevtaTranslation`** — `(kuldevtaId, locale)` unique, `displayName`.
- **`KuldevtaRegionDefault`** — `regionCode` PK (`MH`, `RJ-W`, `ALL`),
  `region`, `defaultKuldevtaSlug`, `isNationalFallback`.
- **`UserKuldevta`** — `userId` PK, `kuldevtaSlug`, `assignmentTier`,
  `matchedOn[]`, `answers` Json, `profile` Json, `ragflowSessionId`,
  `assignedAt`. `answers` and `profile` are scrubbed on the sati term before
  persistence — see §9.2.

`ragflowSessionId` lives here because RAGFlow holds conversation history
server-side; the backend must persist the session to continue a chat.

## 6. Registry source of truth

`Kuldevta-Registry-v0.2.xlsx` (generated 26 Aug 2026) has four tabs: **Deities**
(33 rows), **Archetypes** (12), **Region Defaults** (8), **Summary** (formulas).
Its sheets are exported to CSV and committed under
`packages/kuldevta-registry/`, from which the Prisma seed is generated. A test
regenerates the seed from the CSVs and fails on drift.

### 6.1 The xlsx and the RAGFlow markdown DISAGREE

The markdown in RAGFlow is not a faithful render of the xlsx. It is a derived
artifact with later v1 decisions applied, and it carries three fields the xlsx
does not have at all (`is_active`, `is_fallback`, `human_reviewed`).

| | xlsx v0.2 | RAGFlow markdown |
|---|---|---|
| `ALL` region default | `kuldevi_anaam` — *"THE TRUE FALLBACK"* | `hanuman_ji` — *"v1 replaces kuldevi_anaam here"* |
| `kuldevi_anaam` | `persona_enabled: TRUE`, no active flag | `is_active: false` — *"[v1] DEACTIVATED"* |
| `confidence` | high / medium (28 / 5) | absent |
| `Iconography`, `Weekly day` | present | present in prose, not frontmatter |
| `is_active`, `is_fallback`, `human_reviewed` | absent | present |

**Neither artifact is authoritative on its own.** The resolution:

- The **xlsx is the content source** — names, aliases, communities, states,
  temples, mantras, niyam, tone notes, confidence.
- The **v1 operational overrides are a separate, explicit layer** in the repo,
  version-controlled and reviewable: `kuldevi_anaam` inactive, `hanuman_ji` the
  national fallback for `ALL`.

The seed applies the overrides on top of the xlsx content and the test asserts
both layers. The xlsx's `ALL` row is stale and should be corrected at source so
the two do not drift further.

### 6.2 Extraction rules

- **Lists are semicolon-separated**, per the workbook README — `Aliases`,
  `Communities`, `States`, `Epithets`, `Festivals`, `Offerings`. Splitting on
  commas will shred `Maratha (many kul); Bhosale; Deshastha`.
- **Do not take Devanagari from the CSV exports.** They are double-encoded
  (`Shakti Â· Ugra`, and every Devanagari name is destroyed:
  `à¤¤à¥à¤³à¤à¤¾ à¤­à¤µà¤¾à¤¨à¥`). Either re-export the xlsx as UTF-8 or take
  `name_devanagari` and `mantra` from the RAGFlow markdown, which is intact.
- `form_of` uses an em-dash for null (`pabuji`, `tejaji`). Also note `ekvira`
  has `form_of: renuka_mahur` — a reference to another registry deity, not a
  god-form. The column mixes two domains; treat it as free text, not an enum.
- `narayani_devi.States` contains `national Marwari diaspora` and
  `ramdev_ji.States` contains `Sindh diaspora` — free text in a region-code
  field.
- The **Summary tab formulas are broken**: it reports `Persona enabled: 0` and
  `Persona disabled: 0` while all 33 rows are `TRUE`. Do not use Summary as a
  validation oracle. Its archetype counts do reconcile to 33 and are usable.
- Three archetypes route no deity: `ram_form`, `kul_purvaj`, `gram_devta`.
  Seed them anyway; they are a reviewed closed vocabulary.

### 6.3 Nothing here is cleared for production

The workbook README is explicit:

> Every row in this workbook is a DRAFT compiled from general knowledge of Hindu
> regional traditions. It has NOT been verified by a pandit or a community
> source. [...] Nothing here should reach a user until the `human_reviewed` flag
> is set to TRUE by a named reviewer.

Every deity in RAGFlow carries `human_reviewed: false`, and 5 rows are
`confidence: medium` (`kalubai`, `randal`, `ban_mata`, `sundha_mata`,
`kheteshwar`). **Per D9b this gate is deliberately NOT enforced for v1.** `humanReviewed`
seeds as TRUE and is flipped to FALSE where review finds a problem — the inverse
of the README's rule, accepted knowingly so that launch is not a wall of region
defaults. The `humanReviewed` and `confidence` columns still exist in the
schema, so turning the gate back on later is a query change, not a migration.
Review should be prioritised by real traffic once there is some, starting with
the `communities` field (the README's own instruction) and the 5
`confidence: medium` rows.

## 7. Stage 1a — `kuldevta-parser`

Rebuilt, not patched. Fixes to the existing agent JSON:

- `llm_id` was `gpt-4o@Embedding@Azure-OpenAI`, an embedding slot — **resolved**,
  changed in the RAGFlow UI.
- `cite: true` must become **false**. Citation markers (`[ID:n]`) make the
  response unparseable as JSON.
- The `Retrieval:TenWavesPull` tool is **removed**. Stage 1a does no retrieval.
- `Tool:PetiteReadersOpen` is **deleted** — it exists in `graph.nodes` with an
  edge from the agent but has no entry in `components` and is absent from the
  agent's `tools` array.
- `max_tokens: 256` stays disabled, or is raised. The profile JSON exceeds it.

The system prompt keeps **Part 1 only** — normalisation, `*_raw` preservation,
the null-not-guess rule, the current-metro flag, the Kashyap gotra default with
`gotra_defaulted: true`. **Parts 2 and 3 are deleted**: shortlisting and
selection are now code.

Output is the `profile` object alone. No `candidates`, no `selection`.

Called with the six answers formatted into `query`, non-streaming, with
**`return_trace: true`**.

### 7.1 Reading the reply — verified against the published agent

Smoke-tested 2026-09-01 against agent `e00c9c78a60511f18e582d93545b9663`. Two
findings, both load-bearing:

**`data.data.content` is empty.** The profile appears only at
`data.data.trace[].outputs.content` for the Agent node. The canvas has no
Message component, so nothing populates the top-level field. The backend reads
from the trace entry whose `component_id` is the Agent node; adding a Message
node downstream is the alternative, but reading the trace is what has been
verified to work.

**The model emits typographic quotes.** The verified run returned
`“other”: []` and `“answers_provided”:5` — U+201C/U+201D instead of ASCII — so
`JSON.parse` fails on otherwise-perfect output. **A repair step before parsing
is required, not optional:** normalise smart quotes to ASCII, strip any markdown
fence, then parse; on failure, one retry, then a typed error. Add a
`Use only straight ASCII double quotes (") in the JSON.` line to the prompt as
well, but do not rely on it — the repair step is the guarantee.

The same run was otherwise correct: soft signals preserved verbatim
(`"Jejuri wale khandoba"`), `gotra_defaulted: true` with `gotra_raw` kept,
`community` used rather than `community_inferred`, and **no deity named**.
`language` came back null and should be treated as best-effort; the matcher does
not read it.

## 8. Stage 1b — the matcher

A pure function over the `kuldevtas` table. The tier ladder, unchanged from the
original prompt but now executable:

1. **alias hit** — Q5/Q6 names the deity or its temple, matched against
   `nameRoman`, `nameDevanagari`, `aliases`, `templeVillage` → `confirmed`
2. community + gotra + ancestral village → `confirmed`
3. community + gotra → `likely`
4. community + district or state → `likely`
5. surname-inferred community + state → `possible`
6. region default for the family's state → `possible` / `fallback`
7. `hanuman_ji` — national fallback, always available

Rules: `active = false` is a `WHERE` clause, so `kuldevi_anaam` is unreachable.
A gotra match where `gotra_defaulted` is true scores **zero**. The shortlist is
never empty. Specificity order for ties: village > gotra > community > region;
an explicit `communities` entry beats regional coverage.

## 9. Stage 2 — `kuldevta-persona`

Begin inputs carry `kuldevta_slug` plus the persona block — name, gender,
`toneNotes`, `archetypeVoice`, `niyam[]`, `mantra`, `epithets[]`, temple. No
retrieval over the kuldevta dataset; identity arrives as data. Optional
retrieval over `Prabhuji-bhagvadgita` for scripture questions.

Gender drives address: `devi` → *kuldevi*, `devta` → *kuldevta*.

First call creates the session (inputs + query); subsequent calls pass
`session_id` and `query` only. The session id is persisted on `UserKuldevta`.

### 9.0a `exception_method` MUST stay empty — this is load-bearing, not an oversight

The Agent node's `exception_default_value: ""` / `exception_method: ""` (as
opposed to the Gita agent's `exception_method: "comment"`, which
`AGENT_FALLBACK_RE` in `crisis-detection.service.ts` matches) is what makes
the crisis path reachable at all.

An upstream content-policy rejection (Azure's classifier blocking the
*prompt*, before the model ever runs) is only visible to our backend as a
**thrown error** — `callPersonaAgent` reads the rejection out of the
non-2xx/embedded-error response body and throws it, and
`assessAgentError` (`@api/core/chat`) pattern-matches that error's message
to recognise it as a crisis signal.

If `exception_method` were set to `"comment"`, RAGFlow would catch that same
rejection internally and return `exception_default_value` — a polite,
successful-looking HTTP 200 response — instead of letting it surface as a
failure. `callPersonaAgent` would never throw, `assessAgentError` would never
run, and the crisis card would be **unreachable by construction**, silently,
for exactly the users who most need it (a distress conversation is the one
most likely to trip the classifier). Do not "align" this agent's exception
handling with the Gita agent's without redesigning this entire path first.

### 9.1 The `narayani_devi` sati prohibition — legally mandatory

The registry flags one deity for special handling, in both the workbook README
and the row's own Notes:

> The persona must never reference, narrate or valorise sati in any form —
> glorification of sati is a criminal offence in India under the Commission of
> Sati (Prevention) Act, 1987. **This rule is enforced in the guardrail block,
> not left to the model.**

`narayani_devi` is the kuldevi of Agarwal, Maheshwari and Marwari Bania
families — a high-traffic assignment, not an edge case. Implementation:

1. A system-prompt rule instructing the persona to refer to her only as
   Narayani Devi / Dadiji and never to narrate the sati account.
2. **A backend output guardrail** that inspects every stage-2 reply for this
   deity and suppresses it on a sati-related match, substituting a safe
   response. The registry's instruction that this is "not left to the model" is
   the requirement; a prompt rule alone does not satisfy it.
3. Test fixtures that attempt to elicit the narrative directly, indirectly, and
   in Hindi.

Treat this the same way as the crisis path below: a code-level guarantee, not a
prompt-level hope.

### 9.2 The input path is also exposed — and counsel decides the rest

The output guardrail closes one failure mode. It does not close these.

Question 5 asks which temple the grandparents visited. A Marwari family from
Jhunjhunu will often answer, in their own words, **"Rani Sati Dadi mandir"** —
the temple's popular name, which the registry has deliberately excluded from
`narayani_devi.aliases` (`Dadiji; Jhunjhunu Dadi; Narayani Maa`). The phrase
therefore enters through the *user*, and our own design then:

- records `soft_signals.temple_mentioned` **verbatim** (§7),
- persists it in `answers` / `profile` JSON on `UserKuldevta` (§5),
- may echo it into logs, analytics, and stage-2 conversation history.

**Mitigations, required regardless of the legal answer** — cheap, and each
independent of it:

1. Scrub the term from `temple_mentioned` before persisting.
2. Redact it from logs and analytics payloads.
3. Keep the §9.1 output guardrail as defence in depth, not as the control.

Note the limit of a matcher: it catches the word and its variants, not an
oblique retelling in Hindi or a devotional framing that never uses it.

**Deferred decision — `persona_enabled` for `narayani_devi`.** It stays **TRUE**
for now. Whether to disable the persona (keeping the *assignment*, routing chat
to the region default) is deferred until counsel advises. That flip is a data
change, not a code change, which is why the flag exists.

**Questions for counsel**, to be asked with the six questions, the registry row
and the persona design in hand — not in the abstract:

- Where is the line between naming the deity and her temple, ordinary
  devotional content, narrating the origin account, and valorising it? The
  product sits in the first two by design.
- Is displaying "Shri Narayani Devi Mandir, Jhunjhunu" as the family's kuldevta
  seat itself a risk?
- If a user types "Rani Sati" and we store, index or echo it, what is the
  exposure — and does intermediary safe harbour under the IT Act and the 2021
  Rules apply to a generative feature? What due diligence would relying on it
  require?
- Must we actively block the term, or only refrain from generating it? These
  are materially different builds.
- Who carries liability — the company, its directors, a designated officer?
- Should `narayani_devi` ship in v1 at all?

*Engineering has no view on the answers; it has built the flag so either answer
is one row to apply.*

**Crisis handling is mandatory.** The system prompt must emit the literal
`DISTRESS_DETECTED` sentinel and nothing else on any sign of self-harm, and
every reply passes through `assessAgentTurn` in `apps/api/src/core/chat/`. A
devotional chat receives grief and family crisis by its nature; the existing
module already handles both the sentinel path and the Azure content-policy
rejection path, and stage 2 must not bypass either.

## 10. Verification

A golden set of roughly 40 hand-labelled families, asserting exact slug and
exact tier:

- one per tier of the ladder
- one per region default (all 8)
- the all-unknown case → `hanuman_ji`, tier `fallback`
- **the Jejuri case that failed under retrieval** → must return `khandoba`
- **the `ambaji` vs `ambabai` pair** → must not collapse
- a family whose only signal is an inactive deity → must never return
  `kuldevi_anaam`
- answers in Devanagari, Latin and mixed script
- an answer that addresses the wrong question → the field is null, not guessed
- an Agarwal/Marwari family → `narayani_devi`, and stage 2 refuses to narrate
  sati when asked directly, indirectly, and in Hindi (§9.1)
- a family matching a `confidence: medium` deity → assignment still returns, and
  the tier reflects the weaker evidence

Invariants across the whole set: the returned slug always exists in the
registry; an inactive deity is never returned; tiers are assigned honestly —
if most fixtures come back `confirmed`, the ladder is too generous.

## 11. Release strategy

`origin/stage` is 29 commits ahead of `origin/main`; `main` is production and
carries none of stage's unreleased work. Branches follow `TAM-###-slug`.

1. Cut `TAM-###-kuldevta-khoj` from **`main`** — not from `stage`, so the branch
   never carries unrelated unreleased work into production later.
2. Merge that branch into **`stage`**. Run the Prisma migration and seed against
   the staging database. Validate the golden set (§10) end to end against the
   published RAGFlow agents.
3. On verification, merge **the same branch** into `main`, and run the migration
   and seed against production.

**Merge the branch to both targets; do not cherry-pick and do not merge `stage`
into `main`.** Merging `stage` would drag all 29 unrelated commits into
production. Cherry-picking duplicates commits under new hashes, so the branch
and `main` later report phantom conflicts on the same lines. Reserve
cherry-picking for hotfixes that genuinely cannot wait for the queue ahead of
them.

The migration is additive — new tables only, no change to `deities` or any
existing column — so it is safe to apply to staging ahead of the merge to
`main`, and there is no rollback coupling with production content.

## 12. Out of scope for v1

- Kuldevta artwork (D6). `Kuldevta` carries no `artworkUrl` in v1.
- Re-activating `kuldevi_anaam`, which needs its own screen, non-specific
  artwork and persona rules.
- Reconciling the three overlapping slugs with the app's `deities` taxonomy.
- `config.national_default`, referenced by `region-defaults/all.md` but present
  in neither the dataset nor `app_config`.

## 13. Open items

**Resolved**

- Agent 1 is published: **`e00c9c78a60511f18e582d93545b9663`**, smoke-tested
  (§7.1). The earlier `aa5953b8a5cf11f18455bf94535108a7` is the superseded
  pre-fix agent and should be retired to avoid ambiguity.
- Chat model is `gpt-4o@kb-asr-models@Azure-OpenAI` — a real chat slot; the
  embedding-slot bug in §7 is fixed. The phantom `Tool:PetiteReadersOpen` node
  is also gone (components are now `begin` + `Agent:WideLlamasSing` only).
- Encoding: the workbook is read from Google Drive
  (`1oWWElX4v9F50uV10Dyhi7zw6tBR9_vmK`), where Devanagari is intact. The CSV
  exports are not used. §6.2's mojibake workaround is no longer needed.

**Still to do**

- **Agent 2 does not exist yet.** Implementation produces its DSL for import.
- Confirmation that the v1 override stands — `hanuman_ji` as the `ALL` fallback
  with `kuldevi_anaam` inactive (§6.1). Proceeding on that basis unless told
  otherwise.
- The `human_reviewed` gate (§6.3): reviewer name(s), and whether it blocks
  launch or is enforced per-row.
- Counsel's answer on `narayani_devi` (§9.2). `persona_enabled` stays TRUE until
  then; the flip, if any, is a data change. Not a launch blocker.
