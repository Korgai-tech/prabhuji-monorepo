# Kuldevta Khoj Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A family answers six lineage questions and is deterministically assigned a kuldevta from a 33-deity registry, then can chat with that deity's persona.

**Architecture:** A RAGFlow agent parses messy Hinglish into a structured profile and names no deity. A pure backend function matches that profile against `kuldevtas` tables in Postgres and returns a slug plus an assignment tier. A second RAGFlow agent speaks the persona, with its identity injected by the backend rather than retrieved. Retrieval is used nowhere in the assignment path — it was measured to rank the correct deity second on a textbook case.

**Tech Stack:** Fastify 5, Zod 4, Prisma 6.19 / PostgreSQL 18, vitest, tsx seeds, nx + pnpm, RAGFlow agent API.

**Spec:** `docs/superpowers/design/2026-09-01-kuldevta-agents-design.md` — read it first. The plan argues from it.

## Global Constraints

- **Layer boundaries are mechanically enforced** by `pnpm check:arch-boundaries` against `arch-boundaries.json`. Under `apps/api/src`: files in `/controllers/` may not import `/repositories/` or `@prisma/client`; files in `/services/` may not import `/controllers/`, `/routes/`, or `@prisma/client`; files in `/repositories/` may not import `/controllers/`, `/services/`, or `/routes/`. **Prisma lives only in repositories.**
- Path alias is `@api/core/…`. Relative imports carry the `.js` extension (ESM).
- Module layout follows `apps/api/src/core/<module>/{api,controllers,repositories,routes,services,__tests__,index.ts,types.ts}` — copy `core/deity` as the exemplar.
- Seeds live in `apps/api/prisma/seeds/<name>.seed.ts`, use `runSeed` / `isSeedCli` / `SeedCounts` from `./_shared.js`, and MUST be idempotent (`upsert` on unique keys).
- Tests: `pnpm nx test api` runs `vitest run --project unit`. Integration is `pnpm nx test api --configuration=integration`. Unit tests go in `__tests__/*.test.ts`; integration in `__tests__/*.integration.test.ts`.
- Adding routes requires `pnpm openapi:emit` then `pnpm check:openapi`.
- Full gate before any merge: `pnpm verify`.
- **The column is `kuldevtaSlug` / `kuldevta_slug`. Never `deityId`.** There must be no foreign key between kuldevta tables and the existing `deities` table — they are disjoint vocabularies (spec §2, D5).
- Registry ids are the closed vocabulary. `hanuman_ji` is the `ALL` fallback; `kuldevi_anaam` seeds `active: false` and must never be returned (D9a).
- `humanReviewed` seeds **TRUE** (D9b) — deliberately inverting the workbook README.
- RAGFlow parser agent id: `e00c9c78a60511f18e582d93545b9663`. Calls use `return_trace: true` and read `data.data.trace[].outputs.content` — the top-level `content` is empty (spec §7.1).

---

### Task 1: Registry snapshot package

Commit the registry as data the build owns, rather than reading Google Drive at runtime.

**Files:**
- Create: `packages/kuldevta-registry/package.json`
- Create: `packages/kuldevta-registry/src/registry.types.ts`
- Create: `packages/kuldevta-registry/src/index.ts`
- Create: `packages/kuldevta-registry/data/deities.json`
- Create: `packages/kuldevta-registry/data/archetypes.json`
- Create: `packages/kuldevta-registry/data/region-defaults.json`
- Create: `packages/kuldevta-registry/scripts/refresh-from-drive.md`
- Test: `packages/kuldevta-registry/src/__tests__/registry.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `RegistryDeity`, `RegistryArchetype`, `RegistryRegionDefault`, `Registry`; `loadRegistry(): Registry`.

The source is the Google Drive workbook `1oWWElX4v9F50uV10Dyhi7zw6tBR9_vmK` (`Kuldevta-Registry-v0.2.xlsx`). **Do not use the CSV exports** — they are double-encoded and destroy every Devanagari string (spec §6.2). Read from Drive, where the text is intact.

Lists in the workbook are **semicolon-separated** (`Aliases`, `Communities`, `States`, `Epithets`, `Festivals`, `Offerings`). Splitting on commas shreds `Maratha (many kul); Bhosale; Deshastha`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { loadRegistry } from "../index.js";

describe("kuldevta registry snapshot", () => {
  const r = loadRegistry();

  it("has 33 deities, 12 archetypes, 8 region defaults", () => {
    expect(r.deities).toHaveLength(33);
    expect(r.archetypes).toHaveLength(12);
    expect(r.regionDefaults).toHaveLength(8);
  });

  it("parses semicolon lists rather than comma lists", () => {
    const tulja = r.deities.find((d) => d.id === "tulja_bhavani")!;
    expect(tulja.communities).toContain("Maratha (many kul)");
    expect(tulja.communities).toContain("Bhosale");
  });

  it("preserves Devanagari intact", () => {
    const khandoba = r.deities.find((d) => d.id === "khandoba")!;
    expect(khandoba.nameDevanagari).toBe("खंडोबा");
    expect(khandoba.mantra).toContain("मार्तण्ड");
  });

  it("every archetype referenced by a deity exists", () => {
    const ids = new Set(r.archetypes.map((a) => a.id));
    for (const d of r.deities) expect(ids).toContain(d.archetype);
  });

  it("every region default points at a real deity id", () => {
    const ids = new Set(r.deities.map((d) => d.id));
    for (const rd of r.regionDefaults) expect(ids).toContain(rd.defaultDeityId);
  });

  it("applies the v1 overrides (D9a)", () => {
    expect(r.regionDefaults.find((x) => x.regionCode === "ALL")!.defaultDeityId).toBe("hanuman_ji");
    expect(r.deities.find((d) => d.id === "kuldevi_anaam")!.active).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/kuldevta-registry`
Expected: FAIL — `Cannot find module '../index.js'`

- [ ] **Step 3: Write the types**

```ts
// packages/kuldevta-registry/src/registry.types.ts
export type Gender = "devi" | "devta";
export type Confidence = "high" | "medium";

export interface RegistryArchetype {
  id: string;              // "shiva_form"
  name: string;            // "Shiva-form"
  description: string;
  voiceDirection: string;
}

export interface RegistryDeity {
  id: string;              // "khandoba" — the closed vocabulary
  nameRoman: string;
  nameDevanagari: string;
  aliases: string[];
  archetype: string;       // -> RegistryArchetype.id
  formOf: string | null;   // em-dash in source means null
  gender: Gender;
  states: string[];
  communities: string[];
  templeName: string | null;
  templeVillage: string | null;
  templeDistrict: string | null;
  templeState: string | null;
  iconography: string | null;
  epithets: string[];
  mantra: string | null;
  weeklyDay: string | null;
  festivals: string[];
  offerings: string[];
  niyam: string[];
  toneNotes: string | null;
  personaEnabled: boolean;
  confidence: Confidence;
  notes: string | null;
  // v1 operational layer, not present in the workbook (spec §6.1)
  active: boolean;
  isFallback: boolean;
  humanReviewed: boolean;
}

export interface RegistryRegionDefault {
  regionCode: string;      // "MH", "RJ-W", "ALL"
  region: string;
  defaultDeityId: string;
  isNationalFallback: boolean;
  caveat: string | null;
}

export interface Registry {
  deities: RegistryDeity[];
  archetypes: RegistryArchetype[];
  regionDefaults: RegistryRegionDefault[];
}
```

- [ ] **Step 4: Generate the three JSON files from Drive**

Read the workbook from Drive and write `data/*.json` conforming to the types above. Apply exactly these transforms:

1. Split list columns on `;` and trim each element; drop empties.
2. Map the em-dash `—` to `null` for `formOf`, `templeVillage`, `templeDistrict`, `templeState`, `weeklyDay`.
3. `personaEnabled`: `"TRUE"` → `true`.
4. Apply the v1 operational layer, which the workbook does not contain:
   - every deity: `active: true`, `humanReviewed: true`, `isFallback: false`
   - `kuldevi_anaam`: `active: false`
   - `hanuman_ji`: `isFallback: true`
   - region default `ALL`: `defaultDeityId: "hanuman_ji"`, `isNationalFallback: true` (the workbook says `kuldevi_anaam`; it is stale — spec §6.1)
5. Leave `narayani_devi.personaEnabled` as `true` (spec §9.2, deferred to counsel).

Record the transform and the Drive file id in `scripts/refresh-from-drive.md` so a future refresh is reproducible.

- [ ] **Step 5: Write the loader**

```ts
// packages/kuldevta-registry/src/index.ts
import archetypes from "../data/archetypes.json" with { type: "json" };
import deities from "../data/deities.json" with { type: "json" };
import regionDefaults from "../data/region-defaults.json" with { type: "json" };
import type { Registry } from "./registry.types.js";

export * from "./registry.types.js";

export function loadRegistry(): Registry {
  return {
    deities: deities as Registry["deities"],
    archetypes: archetypes as Registry["archetypes"],
    regionDefaults: regionDefaults as Registry["regionDefaults"],
  };
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm vitest run packages/kuldevta-registry`
Expected: PASS (6 tests)

- [ ] **Step 7: Commit**

```bash
git add packages/kuldevta-registry
git commit -m "feat(kuldevta): commit registry snapshot from Kuldevta-Registry-v0.2.xlsx"
```

---

### Task 2: Prisma schema and migration

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (append after the `Deity` models)
- Create: `apps/api/prisma/migrations/<timestamp>_add_kuldevta_registry/migration.sql` (generated)
- Test: `apps/api/src/core/kuldevta/__tests__/schema.integration.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: Prisma models `KuldevtaArchetype`, `Kuldevta`, `KuldevtaTranslation`, `KuldevtaRegionDefault`, `UserKuldevta`.

- [ ] **Step 1: Add the models**

```prisma
model KuldevtaArchetype {
  id             String     @id                       // "shiva_form"
  name           String
  description    String
  voiceDirection String     @map("voice_direction")
  kuldevtas      Kuldevta[]
  @@map("kuldevta_archetypes")
}

model Kuldevta {
  id             String   @id @default(uuid()) @db.Uuid
  slug           String   @unique                     // "khandoba" — closed vocabulary
  nameRoman      String   @map("name_roman")
  nameDevanagari String   @map("name_devanagari")
  aliases        String[] @default([])
  archetypeId    String   @map("archetype_id")
  formOf         String?  @map("form_of")
  gender         String                                // "devi" | "devta"
  states         String[] @default([])
  communities    String[] @default([])
  templeName     String?  @map("temple_name")
  templeVillage  String?  @map("temple_village")
  templeDistrict String?  @map("temple_district")
  templeState    String?  @map("temple_state")
  iconography    String?
  epithets       String[] @default([])
  mantra         String?
  weeklyDay      String?  @map("weekly_day")
  festivals      String[] @default([])
  offerings      String[] @default([])
  niyam          String[] @default([])
  toneNotes      String?  @map("tone_notes")
  personaEnabled Boolean  @default(true) @map("persona_enabled")
  confidence     String   @default("high")
  notes          String?
  active         Boolean  @default(true)
  isFallback     Boolean  @default(false) @map("is_fallback")
  humanReviewed  Boolean  @default(true)  @map("human_reviewed")
  reviewedBy     String?  @map("reviewed_by")
  reviewedAt     DateTime? @map("reviewed_at")
  createdAt      DateTime @default(now()) @map("created_at")
  updatedAt      DateTime @updatedAt @map("updated_at")

  archetype    KuldevtaArchetype     @relation(fields: [archetypeId], references: [id])
  translations KuldevtaTranslation[]

  @@index([active])
  @@map("kuldevtas")
}

model KuldevtaTranslation {
  id          String @id @default(uuid()) @db.Uuid
  kuldevtaId  String @map("kuldevta_id") @db.Uuid
  locale      String
  displayName String @map("display_name")

  kuldevta Kuldevta @relation(fields: [kuldevtaId], references: [id], onDelete: Cascade)

  @@unique([kuldevtaId, locale], name: "kuldevta_translation_unique")
  @@map("kuldevta_translations")
}

model KuldevtaRegionDefault {
  regionCode         String  @id @map("region_code")   // "MH", "RJ-W", "ALL"
  region             String
  defaultKuldevtaSlug String @map("default_kuldevta_slug")
  isNationalFallback Boolean @default(false) @map("is_national_fallback")
  caveat             String?
  @@map("kuldevta_region_defaults")
}

model UserKuldevta {
  userId          String   @id @map("user_id") @db.Uuid
  kuldevtaSlug    String   @map("kuldevta_slug")
  assignmentTier  String   @map("assignment_tier")     // confirmed|likely|possible|fallback
  matchedOn       String[] @default([]) @map("matched_on")
  answers         Json
  profile         Json
  ragflowSessionId String? @map("ragflow_session_id")
  assignedAt      DateTime @default(now()) @map("assigned_at")

  @@index([kuldevtaSlug])
  @@map("user_kuldevtas")
}
```

There is deliberately **no relation** between `Kuldevta` and `Deity`, and `defaultKuldevtaSlug` / `kuldevtaSlug` are logical slug refs with no FK — matching the repo's cross-module convention and keeping the two vocabularies unjoinable (spec §2).

- [ ] **Step 2: Generate the migration**

```bash
cd apps/api && pnpm prisma migrate dev --name add_kuldevta_registry --create-only
```

- [ ] **Step 3: Verify the migration is purely additive**

Read the generated SQL. It must contain only `CREATE TABLE` / `CREATE INDEX` statements. **Any `ALTER TABLE deities` or `DROP` is a bug** — the migration must not touch existing tables (spec §11).

- [ ] **Step 4: Write the integration test**

```ts
// apps/api/src/core/kuldevta/__tests__/schema.integration.test.ts
import { PrismaClient } from "@prisma/client";
import { afterAll, describe, expect, it } from "vitest";

const prisma = new PrismaClient();
afterAll(async () => { await prisma.$disconnect(); });

describe("kuldevta schema", () => {
  it("exposes the five tables", async () => {
    const rows = await prisma.$queryRaw<{ table_name: string }[]>`
      select table_name from information_schema.tables
      where table_schema = 'public' and table_name in
        ('kuldevtas','kuldevta_translations','kuldevta_archetypes',
         'kuldevta_region_defaults','user_kuldevtas')`;
    expect(rows).toHaveLength(5);
  });

  it("has no foreign key from kuldevtas to deities", async () => {
    const rows = await prisma.$queryRaw<{ n: bigint }[]>`
      select count(*) as n from information_schema.table_constraints tc
      join information_schema.constraint_column_usage ccu
        on tc.constraint_name = ccu.constraint_name
      where tc.table_name = 'kuldevtas'
        and tc.constraint_type = 'FOREIGN KEY'
        and ccu.table_name = 'deities'`;
    expect(Number(rows[0].n)).toBe(0);
  });
});
```

- [ ] **Step 5: Apply and run**

```bash
cd apps/api && pnpm prisma migrate dev && pnpm prisma generate
pnpm nx test api --configuration=integration
```
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/api/prisma apps/api/src/core/kuldevta
git commit -m "feat(kuldevta): add registry and assignment tables"
```

---

### Task 3: Seed the registry

**Files:**
- Create: `apps/api/prisma/seeds/kuldevta.seed.ts`
- Modify: `apps/api/prisma/seeds/all.seed.ts` (register the new seed)
- Modify: `apps/api/package.json` (add `"seed:kuldevta": "tsx prisma/seeds/kuldevta.seed.ts"`)
- Test: `apps/api/src/core/kuldevta/__tests__/seed.integration.test.ts`

**Interfaces:**
- Consumes: `loadRegistry()` from Task 1; Prisma models from Task 2.
- Produces: `seedKuldevta(tx): Promise<SeedCounts>`.

- [ ] **Step 1: Write the failing test**

```ts
import { PrismaClient } from "@prisma/client";
import { afterAll, describe, expect, it } from "vitest";

const prisma = new PrismaClient();
afterAll(async () => { await prisma.$disconnect(); });

describe("kuldevta seed", () => {
  it("seeds 33 deities, 12 archetypes, 8 region defaults", async () => {
    expect(await prisma.kuldevta.count()).toBe(33);
    expect(await prisma.kuldevtaArchetype.count()).toBe(12);
    expect(await prisma.kuldevtaRegionDefault.count()).toBe(8);
  });

  it("leaves kuldevi_anaam inactive and everything else active", async () => {
    const inactive = await prisma.kuldevta.findMany({ where: { active: false } });
    expect(inactive.map((k) => k.slug)).toEqual(["kuldevi_anaam"]);
  });

  it("makes hanuman_ji the national fallback", async () => {
    const all = await prisma.kuldevtaRegionDefault.findUniqueOrThrow({ where: { regionCode: "ALL" } });
    expect(all.defaultKuldevtaSlug).toBe("hanuman_ji");
    expect(all.isNationalFallback).toBe(true);
  });

  it("keeps Devanagari and semicolon-split communities intact", async () => {
    const k = await prisma.kuldevta.findUniqueOrThrow({ where: { slug: "khandoba" } });
    expect(k.nameDevanagari).toBe("खंडोबा");
    expect(k.communities).toContain("Dhangar");
  });

  it("seeds humanReviewed true for every row (D9b)", async () => {
    expect(await prisma.kuldevta.count({ where: { humanReviewed: false } })).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm nx test api --configuration=integration`
Expected: FAIL — counts are 0

- [ ] **Step 3: Write the seed**

```ts
// apps/api/prisma/seeds/kuldevta.seed.ts
/**
 * Kuldevta registry seed. Source of truth is the committed snapshot in
 * `packages/kuldevta-registry`, itself derived from Kuldevta-Registry-v0.2.xlsx.
 * Idempotent: upserts on `slug`, `regionCode`, and `(kuldevtaId, locale)`.
 *
 * Run:  pnpm --filter api run seed:kuldevta
 */
import { loadRegistry } from "@prabhuji/kuldevta-registry";
import type { Prisma } from "@prisma/client";
import { type SeedCounts, isSeedCli, runSeed } from "./_shared.js";

export async function seedKuldevta(tx: Prisma.TransactionClient): Promise<SeedCounts> {
  const registry = loadRegistry();

  for (const a of registry.archetypes) {
    await tx.kuldevtaArchetype.upsert({
      where: { id: a.id },
      create: { id: a.id, name: a.name, description: a.description, voiceDirection: a.voiceDirection },
      update: { name: a.name, description: a.description, voiceDirection: a.voiceDirection },
    });
  }

  for (const d of registry.deities) {
    const fields = {
      nameRoman: d.nameRoman, nameDevanagari: d.nameDevanagari, aliases: d.aliases,
      archetypeId: d.archetype, formOf: d.formOf, gender: d.gender,
      states: d.states, communities: d.communities,
      templeName: d.templeName, templeVillage: d.templeVillage,
      templeDistrict: d.templeDistrict, templeState: d.templeState,
      iconography: d.iconography, epithets: d.epithets, mantra: d.mantra,
      weeklyDay: d.weeklyDay, festivals: d.festivals, offerings: d.offerings,
      niyam: d.niyam, toneNotes: d.toneNotes, personaEnabled: d.personaEnabled,
      confidence: d.confidence, notes: d.notes, active: d.active,
      isFallback: d.isFallback, humanReviewed: d.humanReviewed,
    };
    const row = await tx.kuldevta.upsert({
      where: { slug: d.id }, create: { slug: d.id, ...fields }, update: fields,
    });
    for (const [locale, displayName] of Object.entries({ en: d.nameRoman, hi: d.nameDevanagari })) {
      await tx.kuldevtaTranslation.upsert({
        where: { kuldevta_translation_unique: { kuldevtaId: row.id, locale } },
        create: { kuldevtaId: row.id, locale, displayName },
        update: { displayName },
      });
    }
  }

  for (const r of registry.regionDefaults) {
    const fields = {
      region: r.region, defaultKuldevtaSlug: r.defaultDeityId,
      isNationalFallback: r.isNationalFallback, caveat: r.caveat,
    };
    await tx.kuldevtaRegionDefault.upsert({
      where: { regionCode: r.regionCode }, create: { regionCode: r.regionCode, ...fields }, update: fields,
    });
  }

  return {
    archetypes: registry.archetypes.length,
    kuldevtas: registry.deities.length,
    regionDefaults: registry.regionDefaults.length,
  };
}

if (isSeedCli(import.meta.url)) await runSeed("kuldevta", seedKuldevta);
```

- [ ] **Step 4: Run the seed twice, then the tests**

```bash
pnpm --filter api run seed:kuldevta
pnpm --filter api run seed:kuldevta   # second run must not duplicate
pnpm nx test api --configuration=integration
```
Expected: identical counts both runs; tests PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/prisma/seeds apps/api/package.json apps/api/src/core/kuldevta
git commit -m "feat(kuldevta): seed registry from committed snapshot"
```

---

### Task 4: The matcher

The heart of the feature. A pure function, no I/O, fully unit-tested — this is what replaces the retrieval that ranked the correct deity second (spec §2).

**Files:**
- Create: `apps/api/src/core/kuldevta/types.ts`
- Create: `apps/api/src/core/kuldevta/services/kuldevta-matcher.service.ts`
- Create: `apps/api/src/core/kuldevta/services/index.ts`
- Test: `apps/api/src/core/kuldevta/__tests__/kuldevta-matcher.service.test.ts`

**Interfaces:**
- Consumes: `Registry` from Task 1.
- Produces:
  - `type AssignmentTier = "confirmed" | "likely" | "possible" | "fallback"`
  - `interface KuldevtaProfile` (exact shape emitted by the parser agent)
  - `interface MatchResult { slug: string; tier: AssignmentTier; matchedOn: string[] }`
  - `matchKuldevta(profile: KuldevtaProfile, registry: Registry): MatchResult`

- [ ] **Step 1: Write the types**

```ts
// apps/api/src/core/kuldevta/types.ts
export type AssignmentTier = "confirmed" | "likely" | "possible" | "fallback";

export interface KuldevtaProfile {
  surname: string | null;
  surname_raw: string | null;
  community: string | null;
  community_raw: string | null;
  community_inferred: string | null;
  gotra: string | null;
  gotra_raw: string | null;
  gotra_defaulted: boolean;
  ancestral_place: {
    village: string | null;
    district: string | null;
    state: string | null;
    raw: string | null;
  };
  ancestral_place_may_be_current: boolean;
  language: string | null;
  soft_signals: {
    temple_mentioned: string | null;
    mandir_photo: string | null;
    other: string[];
  };
  answers_provided: number;
}

export interface MatchResult {
  slug: string;
  tier: AssignmentTier;
  matchedOn: string[];
}
```

- [ ] **Step 2: Write the failing tests**

```ts
import { loadRegistry } from "@prabhuji/kuldevta-registry";
import { describe, expect, it } from "vitest";
import { matchKuldevta } from "../services/kuldevta-matcher.service.js";
import type { KuldevtaProfile } from "../types.js";

const registry = loadRegistry();

function profile(over: Partial<KuldevtaProfile> = {}): KuldevtaProfile {
  return {
    surname: null, surname_raw: null, community: null, community_raw: null,
    community_inferred: null, gotra: null, gotra_raw: null, gotra_defaulted: false,
    ancestral_place: { village: null, district: null, state: null, raw: null },
    ancestral_place_may_be_current: false, language: null,
    soft_signals: { temple_mentioned: null, mandir_photo: null, other: [] },
    answers_provided: 0, ...over,
  };
}

describe("matchKuldevta", () => {
  it("alias hit on the temple village wins — the case retrieval got wrong", () => {
    const r = matchKuldevta(profile({
      community: "Maratha",
      ancestral_place: { village: null, district: "Satara", state: "Maharashtra", raw: "Satara" },
      soft_signals: { temple_mentioned: "Jejuri wale khandoba", mandir_photo: null, other: [] },
    }), registry);
    expect(r.slug).toBe("khandoba");
    expect(r.tier).toBe("confirmed");
    expect(r.matchedOn).toContain("alias");
  });

  it("does NOT confuse ambaji with ambabai", () => {
    const r = matchKuldevta(profile({
      soft_signals: { temple_mentioned: "Ambabai", mandir_photo: null, other: [] },
      ancestral_place: { village: null, district: "Kolhapur", state: "Maharashtra", raw: "Kolhapur" },
    }), registry);
    expect(r.slug).toBe("mahalakshmi_kolhapur");
    expect(r.slug).not.toBe("ambaji");
  });

  it("community plus gotra is likely, not confirmed", () => {
    const r = matchKuldevta(profile({
      community: "Dadhich Brahmin", gotra: "Dadhich",
      ancestral_place: { village: null, district: "Nagaur", state: "Rajasthan", raw: "Nagaur" },
    }), registry);
    expect(r.slug).toBe("dadhimati");
    expect(r.tier).toBe("likely");
  });

  it("a defaulted gotra contributes nothing", () => {
    const withDefault = matchKuldevta(profile({
      community: "Rathore", gotra: "Kashyap", gotra_defaulted: true,
      ancestral_place: { village: null, district: null, state: "Rajasthan", raw: "Rajasthan" },
    }), registry);
    expect(withDefault.matchedOn).not.toContain("gotra");
  });

  it("falls back to the region default when only the state is known", () => {
    const r = matchKuldevta(profile({
      ancestral_place: { village: null, district: null, state: "Gujarat", raw: "Gujarat" },
    }), registry);
    expect(r.slug).toBe("ambaji");
    expect(["possible", "fallback"]).toContain(r.tier);
  });

  it("returns hanuman_ji when nothing at all matches", () => {
    const r = matchKuldevta(profile(), registry);
    expect(r.slug).toBe("hanuman_ji");
    expect(r.tier).toBe("fallback");
  });

  it("never returns an inactive deity", () => {
    const r = matchKuldevta(profile({
      soft_signals: { temple_mentioned: "Anaam Kuldevi", mandir_photo: null, other: [] },
    }), registry);
    expect(r.slug).not.toBe("kuldevi_anaam");
  });

  it("always returns a slug that exists in the registry", () => {
    const ids = new Set(registry.deities.map((d) => d.id));
    for (const state of ["Maharashtra", "Gujarat", "Rajasthan", "Kerala", "", "asdf"]) {
      const r = matchKuldevta(profile({
        ancestral_place: { village: null, district: null, state, raw: state },
      }), registry);
      expect(ids).toContain(r.slug);
    }
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `pnpm nx test api -- kuldevta-matcher`
Expected: FAIL — `matchKuldevta is not a function`

- [ ] **Step 4: Implement the ladder**

```ts
// apps/api/src/core/kuldevta/services/kuldevta-matcher.service.ts
import type { Registry, RegistryDeity } from "@prabhuji/kuldevta-registry";
import type { AssignmentTier, KuldevtaProfile, MatchResult } from "../types.js";

const norm = (s: string | null | undefined): string =>
  (s ?? "").toLowerCase().replace(/[^a-z0-9ऀ-ॿ ]+/g, " ").replace(/\s+/g, " ").trim();

/** Whole-word containment, so "amba" does not match inside "ambabai". */
function mentions(haystack: string, needle: string): boolean {
  if (!haystack || !needle) return false;
  return new RegExp(`(^| )${needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}( |$)`).test(haystack);
}

const STATE_CODES: Record<string, string[]> = {
  maharashtra: ["MH"], gujarat: ["GJ"],
  rajasthan: ["RJ", "RJ-W", "RJ-E", "RJ-S", "RJ-NE"],
  karnataka: ["KA", "KA-N"], haryana: ["HR"], punjab: ["PB"],
  "madhya pradesh": ["MP", "MP-N"], "uttar pradesh": ["UP-W"],
};

export function matchKuldevta(profile: KuldevtaProfile, registry: Registry): MatchResult {
  const pool = registry.deities.filter((d) => d.active);
  const signals = norm(
    [profile.soft_signals.temple_mentioned, profile.soft_signals.mandir_photo,
     ...profile.soft_signals.other].filter(Boolean).join(" ")
  );
  const community = norm(profile.community);
  const communityInferred = norm(profile.community_inferred);
  const gotra = profile.gotra_defaulted ? "" : norm(profile.gotra);
  const village = norm(profile.ancestral_place.village);
  const stateCodes = STATE_CODES[norm(profile.ancestral_place.state)] ?? [];

  const hasCommunity = (d: RegistryDeity, c: string): boolean =>
    !!c && d.communities.some((x) => mentions(norm(x), c) || mentions(c, norm(x)));
  const inRegion = (d: RegistryDeity): boolean =>
    d.states.some((s) => stateCodes.includes(s)) || d.states.includes("ALL");

  // Tier 1 — alias hit. The family named the deity or its temple themselves.
  if (signals) {
    for (const d of pool) {
      const names = [d.nameRoman, d.nameDevanagari, ...d.aliases, d.templeVillage ?? ""]
        .map(norm).filter(Boolean)
        // longest first so "mahalakshmi kolhapur" beats a shorter partial
        .sort((a, b) => b.length - a.length);
      if (names.some((n) => mentions(signals, n))) {
        return { slug: d.id, tier: "confirmed", matchedOn: ["alias"] };
      }
    }
  }

  // Tier 2 — community + gotra + village
  for (const d of pool) {
    if (hasCommunity(d, community) && gotra && hasCommunity(d, gotra) &&
        village && mentions(norm(d.templeVillage ?? ""), village)) {
      return { slug: d.id, tier: "confirmed", matchedOn: ["community", "gotra", "village"] };
    }
  }

  // Tier 3 — community + gotra
  for (const d of pool) {
    if (hasCommunity(d, community) && gotra && hasCommunity(d, gotra)) {
      return { slug: d.id, tier: "likely", matchedOn: ["community", "gotra"] };
    }
  }

  // Tier 4 — community + region. Prefer an explicit community listing.
  const byCommunityAndRegion = pool.filter((d) => hasCommunity(d, community) && inRegion(d));
  if (byCommunityAndRegion.length > 0) {
    return { slug: byCommunityAndRegion[0].id, tier: "likely", matchedOn: ["community", "region"] };
  }
  const byCommunity = pool.filter((d) => hasCommunity(d, community));
  if (byCommunity.length > 0) {
    return { slug: byCommunity[0].id, tier: "likely", matchedOn: ["community"] };
  }

  // Tier 5 — surname-inferred community + region
  const byInferred = pool.filter((d) => hasCommunity(d, communityInferred) && inRegion(d));
  if (byInferred.length > 0) {
    return { slug: byInferred[0].id, tier: "possible", matchedOn: ["community_inferred", "region"] };
  }

  // Tier 6 — region default
  const regionDefault = registry.regionDefaults.find((r) => stateCodes.includes(r.regionCode));
  if (regionDefault) {
    const tier: AssignmentTier = communityInferred ? "possible" : "fallback";
    return { slug: regionDefault.defaultDeityId, tier, matchedOn: ["region"] };
  }

  // Tier 7 — national fallback. Always available.
  const national = registry.regionDefaults.find((r) => r.isNationalFallback);
  return { slug: national?.defaultDeityId ?? "hanuman_ji", tier: "fallback", matchedOn: [] };
}
```

```ts
// apps/api/src/core/kuldevta/services/index.ts
export { matchKuldevta } from "./kuldevta-matcher.service.js";
```

- [ ] **Step 5: Run tests**

Run: `pnpm nx test api -- kuldevta-matcher`
Expected: PASS (8 tests). If the ambaji/ambabai test fails, the alias loop is matching a substring — check the whole-word `mentions` regex and the longest-first sort.

- [ ] **Step 6: Verify boundaries**

Run: `pnpm check:arch-boundaries`
Expected: `✅ No architecture boundary violations` — the matcher imports no Prisma and no controllers.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/core/kuldevta
git commit -m "feat(kuldevta): deterministic matcher replacing retrieval-based selection"
```

---

### Task 5: RAGFlow parser client

**Files:**
- Create: `apps/api/src/core/kuldevta/repositories/ragflow-agent.client.ts`
- Create: `apps/api/src/core/kuldevta/repositories/index.ts`
- Create: `apps/api/src/core/kuldevta/services/profile-json.service.ts`
- Modify: `apps/api/src/core/kuldevta/services/index.ts`
- Test: `apps/api/src/core/kuldevta/__tests__/profile-json.service.test.ts`

**Interfaces:**
- Consumes: `KuldevtaProfile` from Task 4.
- Produces:
  - `repairAndParseProfile(raw: string): KuldevtaProfile` — throws `ProfileParseError`
  - `class ProfileParseError extends Error`
  - `callParserAgent(answers: SixAnswers): Promise<string>` — returns the raw content string
  - `interface SixAnswers { surname, ancestralPlace, community, gotra, templeMentioned, mandirPhoto }`

The repair step is **mandatory, not defensive**. The verified run on 2026-09-01 returned `“other”: []` and `“answers_provided”:5` with U+201C/U+201D quotes, which `JSON.parse` rejects (spec §7.1).

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { ProfileParseError, repairAndParseProfile } from "../services/profile-json.service.js";

const GOOD = `{"surname":"Patil","surname_raw":"Patil","community":"Maratha","community_raw":"Maratha","community_inferred":null,"gotra":"Kashyap","gotra_raw":"pata nahi","gotra_defaulted":true,"ancestral_place":{"village":null,"district":"Satara","state":"Maharashtra","raw":"Satara, Maharashtra"},"ancestral_place_may_be_current":false,"language":null,"soft_signals":{"temple_mentioned":"Jejuri wale khandoba","mandir_photo":null,"other":[]},"answers_provided":5}`;

describe("repairAndParseProfile", () => {
  it("parses clean JSON", () => {
    expect(repairAndParseProfile(GOOD).surname).toBe("Patil");
  });

  it("repairs the smart quotes gpt-4o actually emitted", () => {
    const broken = GOOD.replace('"other":[]', '“other”:[]')
                       .replace('"answers_provided"', '“answers_provided”');
    expect(repairAndParseProfile(broken).soft_signals.other).toEqual([]);
  });

  it("strips a markdown fence", () => {
    expect(repairAndParseProfile("```json\n" + GOOD + "\n```").community).toBe("Maratha");
  });

  it("never lets a smart quote inside a value corrupt the text", () => {
    const withQuoted = GOOD.replace('"Jejuri wale khandoba"', '"Jejuri “wale” khandoba"');
    expect(repairAndParseProfile(withQuoted).soft_signals.temple_mentioned)
      .toBe("Jejuri “wale” khandoba");
  });

  it("throws ProfileParseError on unrecoverable output", () => {
    expect(() => repairAndParseProfile("I could not determine the deity.")).toThrow(ProfileParseError);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm nx test api -- profile-json`
Expected: FAIL — module not found

- [ ] **Step 3: Implement**

```ts
// apps/api/src/core/kuldevta/services/profile-json.service.ts
import type { KuldevtaProfile } from "../types.js";

export class ProfileParseError extends Error {
  constructor(public readonly raw: string, cause?: unknown) {
    super("Parser agent returned unparseable profile JSON");
    this.name = "ProfileParseError";
    this.cause = cause;
  }
}

/**
 * gpt-4o emits typographic quotes for some keys — verified 2026-09-01:
 * `“other”: []`. Only quotes acting as JSON *delimiters* are rewritten;
 * a smart quote inside a string value is left alone.
 */
function normaliseQuotes(s: string): string {
  return s.replace(/[“”]/g, (m, i, str) => {
    const before = str.slice(0, i).replace(/\\./g, "");
    const openDoubles = (before.match(/(?<!\\)"/g) ?? []).length;
    const insideString = openDoubles % 2 === 1;
    return insideString ? m : '"';
  });
}

function stripFence(s: string): string {
  return s.replace(/^\s*```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
}

export function repairAndParseProfile(raw: string): KuldevtaProfile {
  const candidate = normaliseQuotes(stripFence(raw ?? ""));
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end <= start) throw new ProfileParseError(raw);
  try {
    return JSON.parse(candidate.slice(start, end + 1)) as KuldevtaProfile;
  } catch (err) {
    throw new ProfileParseError(raw, err);
  }
}
```

```ts
// apps/api/src/core/kuldevta/repositories/ragflow-agent.client.ts
export interface SixAnswers {
  surname: string; ancestralPlace: string; community: string;
  gotra: string; templeMentioned: string; mandirPhoto: string;
}

const PARSER_AGENT_ID = "e00c9c78a60511f18e582d93545b9663";

function formatQuery(a: SixAnswers): string {
  return [
    `1. Surname: ${a.surname}`,
    `2. Parivar kaha se: ${a.ancestralPlace}`,
    `3. Samaj: ${a.community}`,
    `4. Gotra: ${a.gotra}`,
    `5. Dada dadi konse mandir jaate the: ${a.templeMentioned}`,
    `6. Ghar ke mandir mein photo: ${a.mandirPhoto}`,
  ].join("\n");
}

/**
 * The agent's output is NOT in `data.data.content` — that field is empty
 * because the canvas has no Message component. It is only in the trace entry
 * for the Agent node, which requires `return_trace: true` (spec §7.1).
 */
export async function callParserAgent(answers: SixAnswers): Promise<string> {
  const res = await fetch(`${process.env.RAGFLOW_URL}/api/v1/agents/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.RAGFLOW_API_KEY}`,
    },
    body: JSON.stringify({
      agent_id: PARSER_AGENT_ID, query: formatQuery(answers),
      stream: false, return_trace: true,
    }),
  });
  if (!res.ok) throw new Error(`RAGFlow parser HTTP ${res.status}`);
  const body = (await res.json()) as {
    data?: { data?: { trace?: { component_id: string; trace?: { outputs?: { content?: string } }[] }[] } };
  };
  const entries = body.data?.data?.trace ?? [];
  const agentEntry = entries.find((t) => t.component_id.startsWith("Agent:"));
  const content = agentEntry?.trace?.[0]?.outputs?.content;
  if (!content) throw new Error("RAGFlow parser returned no agent output in trace");
  return content;
}
```

```ts
// apps/api/src/core/kuldevta/repositories/index.ts
export { callParserAgent, type SixAnswers } from "./ragflow-agent.client.js";
```

Add to `services/index.ts`:
```ts
export { ProfileParseError, repairAndParseProfile } from "./profile-json.service.js";
```

- [ ] **Step 4: Run tests and boundaries**

Run: `pnpm nx test api -- profile-json && pnpm check:arch-boundaries`
Expected: PASS (5 tests) and no violations.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/core/kuldevta
git commit -m "feat(kuldevta): RAGFlow parser client with mandatory JSON repair"
```

---

### Task 6: Identify endpoint

**Files:**
- Create: `apps/api/src/core/kuldevta/services/kuldevta-identify.service.ts`
- Create: `apps/api/src/core/kuldevta/repositories/kuldevta.repository.ts`
- Create: `apps/api/src/core/kuldevta/controllers/kuldevta.controller.ts`
- Create: `apps/api/src/core/kuldevta/controllers/index.ts`
- Create: `apps/api/src/core/kuldevta/routes/kuldevta.routes.ts`
- Create: `apps/api/src/core/kuldevta/routes/kuldevta.schemas.ts`
- Create: `apps/api/src/core/kuldevta/routes/index.ts`
- Create: `apps/api/src/core/kuldevta/index.ts`
- Modify: the app's module registration (mirror how `initDeityModule` is wired)
- Test: `apps/api/src/core/kuldevta/__tests__/kuldevta-identify.service.test.ts`

**Interfaces:**
- Consumes: `matchKuldevta`, `repairAndParseProfile`, `callParserAgent`.
- Produces: `identifyKuldevta(userId, answers, deps): Promise<IdentifyResult>` where
  `IdentifyResult = { slug, nameRoman, nameDevanagari, temple, tier, matchedOn }`.

`deps` is an explicit dependency object (`{ callParser, loadRegistry, saveAssignment }`) so the service can be unit-tested without network or Prisma — and because the boundary check forbids a service importing Prisma at all.

- [ ] **Step 1: Write the failing test**

```ts
import { loadRegistry } from "@prabhuji/kuldevta-registry";
import { describe, expect, it, vi } from "vitest";
import { identifyKuldevta } from "../services/kuldevta-identify.service.js";

const ANSWERS = {
  surname: "Patil", ancestralPlace: "Satara, Maharashtra", community: "Maratha",
  gotra: "pata nahi", templeMentioned: "Jejuri wale khandoba", mandirPhoto: "bhandara wale devta",
};
const RAW = `{"surname":"Patil","surname_raw":"Patil","community":"Maratha","community_raw":"Maratha","community_inferred":null,"gotra":"Kashyap","gotra_raw":"pata nahi","gotra_defaulted":true,"ancestral_place":{"village":null,"district":"Satara","state":"Maharashtra","raw":"Satara, Maharashtra"},"ancestral_place_may_be_current":false,"language":null,"soft_signals":{"temple_mentioned":"Jejuri wale khandoba","mandir_photo":"bhandara wale devta","other":[]},"answers_provided":5}`;

describe("identifyKuldevta", () => {
  it("returns khandoba and persists the assignment", async () => {
    const saveAssignment = vi.fn().mockResolvedValue(undefined);
    const r = await identifyKuldevta("u-1", ANSWERS, {
      callParser: async () => RAW, loadRegistry, saveAssignment,
    });
    expect(r.slug).toBe("khandoba");
    expect(r.tier).toBe("confirmed");
    expect(r.nameDevanagari).toBe("खंडोबा");
    expect(saveAssignment).toHaveBeenCalledOnce();
  });

  it("scrubs the sati term out of what is persisted (spec §9.2)", async () => {
    const saveAssignment = vi.fn().mockResolvedValue(undefined);
    const raw = RAW.replace("Jejuri wale khandoba", "Rani Sati Dadi mandir Jhunjhunu");
    await identifyKuldevta("u-2", { ...ANSWERS, templeMentioned: "Rani Sati Dadi mandir" }, {
      callParser: async () => raw, loadRegistry, saveAssignment,
    });
    const persisted = JSON.stringify(saveAssignment.mock.calls[0][0]);
    expect(persisted.toLowerCase()).not.toContain("sati");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm nx test api -- kuldevta-identify`
Expected: FAIL — module not found

- [ ] **Step 3: Implement the service**

```ts
// apps/api/src/core/kuldevta/services/kuldevta-identify.service.ts
import type { Registry } from "@prabhuji/kuldevta-registry";
import type { SixAnswers } from "../repositories/index.js";
import type { AssignmentTier, KuldevtaProfile, MatchResult } from "../types.js";
import { matchKuldevta } from "./kuldevta-matcher.service.js";
import { repairAndParseProfile } from "./profile-json.service.js";
import { scrubSati } from "./sati-guardrail.service.js";

export interface IdentifyResult {
  slug: string; nameRoman: string; nameDevanagari: string;
  temple: { village: string | null; district: string | null; state: string | null };
  tier: AssignmentTier; matchedOn: string[];
}

export interface IdentifyDeps {
  callParser: (a: SixAnswers) => Promise<string>;
  loadRegistry: () => Registry;
  saveAssignment: (row: {
    userId: string; kuldevtaSlug: string; assignmentTier: AssignmentTier;
    matchedOn: string[]; answers: unknown; profile: unknown;
  }) => Promise<void>;
}

export async function identifyKuldevta(
  userId: string, answers: SixAnswers, deps: IdentifyDeps
): Promise<IdentifyResult> {
  const raw = await deps.callParser(answers);
  const profile: KuldevtaProfile = repairAndParseProfile(raw);
  const registry = deps.loadRegistry();
  const match: MatchResult = matchKuldevta(profile, registry);
  const deity = registry.deities.find((d) => d.id === match.slug);
  if (!deity) throw new Error(`Matcher returned unknown slug: ${match.slug}`);

  await deps.saveAssignment({
    userId, kuldevtaSlug: match.slug, assignmentTier: match.tier, matchedOn: match.matchedOn,
    answers: scrubSati(answers), profile: scrubSati(profile),
  });

  return {
    slug: deity.id, nameRoman: deity.nameRoman, nameDevanagari: deity.nameDevanagari,
    temple: { village: deity.templeVillage, district: deity.templeDistrict, state: deity.templeState },
    tier: match.tier, matchedOn: match.matchedOn,
  };
}
```

- [ ] **Step 4: Implement the repository, controller, routes**

Repository (the only file here allowed to import Prisma):

```ts
// apps/api/src/core/kuldevta/repositories/kuldevta.repository.ts
import type { PrismaClient } from "@prisma/client";

export function makeKuldevtaRepository(prisma: PrismaClient) {
  return {
    async saveAssignment(row: {
      userId: string; kuldevtaSlug: string; assignmentTier: string;
      matchedOn: string[]; answers: unknown; profile: unknown;
    }): Promise<void> {
      const data = {
        kuldevtaSlug: row.kuldevtaSlug, assignmentTier: row.assignmentTier,
        matchedOn: row.matchedOn,
        answers: row.answers as object, profile: row.profile as object,
      };
      await prisma.userKuldevta.upsert({
        where: { userId: row.userId }, create: { userId: row.userId, ...data }, update: data,
      });
    },
    async findAssignment(userId: string) {
      return prisma.userKuldevta.findUnique({ where: { userId } });
    },
  };
}
export type KuldevtaRepository = ReturnType<typeof makeKuldevtaRepository>;
```

```ts
// apps/api/src/core/kuldevta/routes/kuldevta.schemas.ts
import { z } from "zod";

const answer = z.string().trim().max(200).default("");

export const IdentifyBody = z.object({
  surname: answer, ancestralPlace: answer, community: answer,
  gotra: answer, templeMentioned: answer, mandirPhoto: answer,
});
export type IdentifyInput = z.infer<typeof IdentifyBody>;

export const IdentifyResponse = z.object({
  slug: z.string(),
  nameRoman: z.string(),
  nameDevanagari: z.string(),
  temple: z.object({
    village: z.string().nullable(),
    district: z.string().nullable(),
    state: z.string().nullable(),
  }),
  tier: z.enum(["confirmed", "likely", "possible", "fallback"]),
  matchedOn: z.array(z.string()),
});

export const ErrorEnvelope = z.object({
  error: z.object({ code: z.string(), message: z.string() }),
});
```

```ts
// apps/api/src/core/kuldevta/controllers/kuldevta.controller.ts
// NOTE: no Prisma, no repository import here — arch-boundaries forbids both.
import type { FastifyReply, FastifyRequest } from "fastify";
import type { IdentifyDeps, IdentifyResult } from "@api/core/kuldevta/services";
import { ProfileParseError, identifyKuldevta } from "@api/core/kuldevta/services";
import type { IdentifyInput } from "../routes/kuldevta.schemas.js";

export class KuldevtaController {
  constructor(private readonly deps: IdentifyDeps) {}

  async identify(
    req: FastifyRequest<{ Body: IdentifyInput }>, reply: FastifyReply
  ): Promise<IdentifyResult | undefined> {
    const userId = req.user.id;
    try {
      return await identifyKuldevta(userId, req.body, this.deps);
    } catch (err) {
      if (err instanceof ProfileParseError) {
        req.log.error({ err }, "kuldevta parser returned unparseable profile");
        await reply.code(502).send({
          error: { code: "PARSER_UNAVAILABLE", message: "Could not read the answers. Please try again." },
        });
        return undefined;
      }
      throw err;
    }
  }
}
```

```ts
// apps/api/src/core/kuldevta/routes/kuldevta.routes.ts
import type { FastifyInstance } from "fastify";
import { authMiddleware } from "@api/core/auth/routes";
import type { KuldevtaController } from "@api/core/kuldevta/controllers";
import { ErrorEnvelope, IdentifyBody, IdentifyResponse } from "./kuldevta.schemas.js";

export function registerKuldevtaRoutes(app: FastifyInstance, c: KuldevtaController): void {
  app.post("/kuldevta/identify", {
    preHandler: [authMiddleware],
    schema: {
      tags: ["kuldevta"],
      body: IdentifyBody,
      response: { 200: IdentifyResponse, 502: ErrorEnvelope },
    },
  }, (req, reply) => c.identify(req, reply));
}
```

Check `deity.routes.ts` for the exact auth-middleware import path and adjust if it differs — the shape above mirrors it, but the import surface is the thing most likely to have drifted.

- [ ] **Step 5: Emit and check OpenAPI**

```bash
pnpm openapi:emit && pnpm check:openapi
```
Expected: PASS

- [ ] **Step 6: Run tests and boundaries**

Run: `pnpm nx test api -- kuldevta && pnpm check:arch-boundaries`
Expected: PASS, no violations.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/core/kuldevta apps/api/openapi*.json
git commit -m "feat(kuldevta): identify endpoint wiring parser, matcher and persistence"
```

---

### Task 7: Sati guardrail

Written as its own task because it is a legal requirement, and because the spec is explicit that it must be enforced in code rather than by the model (spec §9.1).

**Files:**
- Create: `apps/api/src/core/kuldevta/services/sati-guardrail.service.ts`
- Modify: `apps/api/src/core/kuldevta/services/index.ts`
- Test: `apps/api/src/core/kuldevta/__tests__/sati-guardrail.service.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `scrubSati<T>(value: T): T` — deep-clones, redacting the term in every string
  - `assertSafeForNarayaniDevi(reply: string): { safe: boolean; redactedReply: string }`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { assertSafeForNarayaniDevi, scrubSati } from "../services/sati-guardrail.service.js";

describe("sati guardrail", () => {
  it("redacts the term from nested user input", () => {
    const out = scrubSati({ a: { b: "Rani Sati Dadi mandir" }, c: ["sati sthal"] });
    expect(JSON.stringify(out).toLowerCase()).not.toContain("sati");
  });

  it("leaves innocent text untouched", () => {
    expect(scrubSati({ t: "Satara" })).toEqual({ t: "Satara" });   // must not match inside "Satara"
    expect(scrubSati({ t: "Saptashrungi" })).toEqual({ t: "Saptashrungi" });
  });

  it("blocks a reply that narrates sati", () => {
    expect(assertSafeForNarayaniDevi("She became sati on her husband's pyre.").safe).toBe(false);
  });

  it("allows ordinary devotional replies", () => {
    expect(assertSafeForNarayaniDevi("Beta, come to Jhunjhunu before the wedding.").safe).toBe(true);
  });

  it("catches the Devanagari form", () => {
    expect(assertSafeForNarayaniDevi("वह सती हो गईं").safe).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm nx test api -- sati-guardrail`
Expected: FAIL — module not found

- [ ] **Step 3: Implement**

```ts
// apps/api/src/core/kuldevta/services/sati-guardrail.service.ts
/**
 * Commission of Sati (Prevention) Act, 1987. The registry requires this to be
 * enforced here, in code, and NOT left to the model (spec §9.1). The prompt
 * rule is defence in depth; this is the control.
 *
 * Word-boundary matching matters: "Satara" and "Saptashrungi" are real
 * registry values and must never be redacted.
 */
const SATI_RE = /(^|[^\p{L}])(sati|satee|सती)($|[^\p{L}])/giu;
const REDACTION = "[redacted]";

export function scrubSati<T>(value: T): T {
  if (typeof value === "string") {
    return value.replace(SATI_RE, (_m, a: string, _t: string, z: string) => `${a}${REDACTION}${z}`) as T;
  }
  if (Array.isArray(value)) return value.map((v) => scrubSati(v)) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, scrubSati(v)])
    ) as T;
  }
  return value;
}

export function assertSafeForNarayaniDevi(reply: string): { safe: boolean; redactedReply: string } {
  SATI_RE.lastIndex = 0;
  const safe = !SATI_RE.test(reply);
  return { safe, redactedReply: safe ? reply : scrubSati(reply) };
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm nx test api -- sati-guardrail`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/core/kuldevta
git commit -m "feat(kuldevta): sati guardrail enforced in code per Act 1987"
```

---

### Task 8: Persona agent and chat endpoint

**Files:**
- Create: `docs/superpowers/design/kuldevta-persona.agent.json` (DSL for import)
- Create: `apps/api/src/core/kuldevta/services/kuldevta-persona.service.ts`
- Modify: `apps/api/src/core/kuldevta/repositories/ragflow-agent.client.ts` (add `callPersonaAgent`)
- Modify: `apps/api/src/core/kuldevta/routes/kuldevta.routes.ts` (add `POST /kuldevta/chat`)
- Test: `apps/api/src/core/kuldevta/__tests__/kuldevta-persona.service.test.ts`

**Interfaces:**
- Consumes: `assertSafeForNarayaniDevi`, `assessAgentTurn` from `@api/core/chat`, `KuldevtaRepository`.
- Produces: `chatAsKuldevta(userId, message, deps): Promise<PersonaReply>` where
  `PersonaReply = { reply: string; crisis: boolean; sessionId: string }`.

Build the agent 2 DSL by copying `kuldevta-parser.agent.json`, then: define Begin `inputs` for `kuldevta_slug`, `name`, `gender`, `tone_notes`, `archetype_voice`, `niyam`, `mantra`, `temple`; keep `mode: conversational`; set `cite: false`; attach **no** Retrieval tool over the kuldevta dataset; restore `message_history_window_size` to 12 (unlike the parser, this one IS a conversation). The prompt must instruct the model to emit the literal `DISTRESS_DETECTED` and nothing else on any sign of self-harm — that sentinel is what `assessAgentTurn` already keys on.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it, vi } from "vitest";
import { chatAsKuldevta } from "../services/kuldevta-persona.service.js";

const deity = {
  slug: "narayani_devi", nameRoman: "Narayani Devi", gender: "devi",
  toneNotes: "Dignified matriarch", archetypeVoice: "Warm, unhurried.",
  niyam: [], mantra: "ॐ नारायण्यै नमः", templeVillage: "Jhunjhunu",
};

describe("chatAsKuldevta", () => {
  it("blocks a reply that narrates sati even if the model produced it", async () => {
    const r = await chatAsKuldevta("u-1", "tell me your story", {
      loadDeity: async () => deity,
      callPersona: async () => ({ reply: "She became sati on the pyre.", sessionId: "s1" }),
      getSessionId: async () => null, saveSessionId: async () => undefined,
    });
    expect(r.reply.toLowerCase()).not.toContain("sati");
  });

  it("routes the DISTRESS_DETECTED sentinel to a crisis result", async () => {
    const r = await chatAsKuldevta("u-2", "I want to end it", {
      loadDeity: async () => deity,
      callPersona: async () => ({ reply: "DISTRESS_DETECTED", sessionId: "s2" }),
      getSessionId: async () => null, saveSessionId: async () => undefined,
    });
    expect(r.crisis).toBe(true);
  });

  it("persists the session id on the first turn", async () => {
    const saveSessionId = vi.fn().mockResolvedValue(undefined);
    await chatAsKuldevta("u-3", "pranam", {
      loadDeity: async () => deity,
      callPersona: async () => ({ reply: "Beta.", sessionId: "s3" }),
      getSessionId: async () => null, saveSessionId,
    });
    expect(saveSessionId).toHaveBeenCalledWith("u-3", "s3");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm nx test api -- kuldevta-persona`
Expected: FAIL — module not found

- [ ] **Step 3: Implement**

```ts
// apps/api/src/core/kuldevta/services/kuldevta-persona.service.ts
import { assessAgentTurn } from "@api/core/chat/services";
import { assertSafeForNarayaniDevi } from "./sati-guardrail.service.js";

export interface PersonaDeity {
  slug: string; nameRoman: string; gender: string;
  toneNotes: string | null; archetypeVoice: string;
  niyam: string[]; mantra: string | null; templeVillage: string | null;
}

export interface PersonaReply { reply: string; crisis: boolean; sessionId: string }

export interface PersonaDeps {
  loadDeity: (userId: string) => Promise<PersonaDeity>;
  callPersona: (args: {
    deity: PersonaDeity; message: string; sessionId: string | null;
  }) => Promise<{ reply: string; sessionId: string }>;
  getSessionId: (userId: string) => Promise<string | null>;
  saveSessionId: (userId: string, sessionId: string) => Promise<void>;
}

const CRISIS_CARD = "";  // the client renders the crisis card; never the model's text

export async function chatAsKuldevta(
  userId: string, message: string, deps: PersonaDeps
): Promise<PersonaReply> {
  const deity = await deps.loadDeity(userId);
  const existing = await deps.getSessionId(userId);
  const { reply, sessionId } = await deps.callPersona({ deity, message, sessionId: existing });

  if (!existing) await deps.saveSessionId(userId, sessionId);

  // 1. Crisis first — it outranks everything, and the reply must not be shown.
  const assessment = assessAgentTurn(reply);
  if (assessment.crisis) return { reply: CRISIS_CARD, crisis: true, sessionId };

  // 2. Sati control. Applies to every deity, not only narayani_devi, because a
  //    persona can be asked about another deity's story.
  const { safe, redactedReply } = assertSafeForNarayaniDevi(reply);
  return { reply: safe ? reply : redactedReply, crisis: false, sessionId };
}
```

Order matters: crisis is evaluated before the sati check, because a crisis reply must be suppressed entirely rather than redacted and shown.

- [ ] **Step 4: Run tests, boundaries, OpenAPI**

Run: `pnpm nx test api -- kuldevta && pnpm check:arch-boundaries && pnpm openapi:emit && pnpm check:openapi`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/core/kuldevta docs/superpowers/design/kuldevta-persona.agent.json apps/api/openapi*.json
git commit -m "feat(kuldevta): persona chat with crisis and sati guardrails"
```

---

### Task 9: Golden set and release

**Files:**
- Create: `apps/api/src/core/kuldevta/__tests__/golden-set.test.ts`
- Create: `apps/api/src/core/kuldevta/__tests__/fixtures/golden-families.json`

**Interfaces:**
- Consumes: `matchKuldevta`, `loadRegistry`.
- Produces: nothing; this is the verification gate.

Roughly 40 hand-labelled families asserting exact slug and exact tier (spec §10): one per tier, one per region default (all 8), the all-unknown case → `hanuman_ji`/`fallback`, **the Jejuri case** → `khandoba`, **the `ambaji` vs `ambabai` pair**, a family whose only signal is inactive → never `kuldevi_anaam`, answers in Devanagari / Latin / mixed script, an answer addressing the wrong question → field null not guessed, an Agarwal/Marwari family → `narayani_devi`, and a `confidence: medium` deity.

- [ ] **Step 1: Write the fixtures and the test**

```ts
// apps/api/src/core/kuldevta/__tests__/golden-set.test.ts
import { loadRegistry } from "@prabhuji/kuldevta-registry";
import { describe, expect, it } from "vitest";
import { matchKuldevta } from "../services/kuldevta-matcher.service.js";
import type { AssignmentTier, KuldevtaProfile } from "../types.js";
import families from "./fixtures/golden-families.json" with { type: "json" };

interface Family {
  name: string;
  profile: KuldevtaProfile;
  expectedSlug: string;
  expectedTier: AssignmentTier;
}

const registry = loadRegistry();
const cases = families as Family[];

describe("golden set", () => {
  it.each(cases.map((f) => [f.name, f] as const))("%s", (_name, f) => {
    const r = matchKuldevta(f.profile, registry);
    expect(r.slug).toBe(f.expectedSlug);
    expect(r.tier).toBe(f.expectedTier);
  });

  it("never returns a slug outside the registry", () => {
    const ids = new Set(registry.deities.map((d) => d.id));
    for (const f of cases) expect(ids).toContain(matchKuldevta(f.profile, registry).slug);
  });

  it("never returns an inactive deity", () => {
    const inactive = new Set(registry.deities.filter((d) => !d.active).map((d) => d.id));
    for (const f of cases) expect(inactive).not.toContain(matchKuldevta(f.profile, registry).slug);
  });

  it("is not over-generous with the confirmed tier", () => {
    const confirmed = cases.filter((f) => matchKuldevta(f.profile, registry).tier === "confirmed");
    // Spec §10: if most fixtures come back confirmed, the ladder is too loose.
    expect(confirmed.length).toBeLessThan(cases.length / 2);
  });
});
```

Fixture file shape — write ~40 of these, covering every case listed above:

```json
[
  {
    "name": "Jejuri alias hit — the case retrieval got wrong",
    "expectedSlug": "khandoba",
    "expectedTier": "confirmed",
    "profile": {
      "surname": "Patil", "surname_raw": "Patil",
      "community": "Maratha", "community_raw": "Maratha", "community_inferred": null,
      "gotra": "Kashyap", "gotra_raw": "pata nahi", "gotra_defaulted": true,
      "ancestral_place": { "village": null, "district": "Satara", "state": "Maharashtra", "raw": "Satara, Maharashtra" },
      "ancestral_place_may_be_current": false, "language": "hi-Latn",
      "soft_signals": { "temple_mentioned": "Jejuri wale khandoba", "mandir_photo": "bhandara wale devta", "other": [] },
      "answers_provided": 5
    }
  },
  {
    "name": "nothing known at all — national fallback",
    "expectedSlug": "hanuman_ji",
    "expectedTier": "fallback",
    "profile": {
      "surname": null, "surname_raw": null,
      "community": null, "community_raw": null, "community_inferred": null,
      "gotra": "Kashyap", "gotra_raw": null, "gotra_defaulted": true,
      "ancestral_place": { "village": null, "district": null, "state": null, "raw": null },
      "ancestral_place_may_be_current": false, "language": null,
      "soft_signals": { "temple_mentioned": null, "mandir_photo": null, "other": [] },
      "answers_provided": 0
    }
  }
]
```

- [ ] **Step 2: Run**

Run: `pnpm nx test api -- golden-set`
Expected: PASS

- [ ] **Step 3: Full gate**

Run: `pnpm verify`
Expected: PASS

- [ ] **Step 4: Commit and promote to stage**

```bash
git add apps/api/src/core/kuldevta/__tests__
git commit -m "test(kuldevta): golden set covering every assignment tier"
git checkout stage && git pull && git merge TAM-165-kuldevta-khoj && git push
```

Then, against the **staging** database: `pnpm --filter api exec prisma migrate deploy` and `pnpm --filter api run seed:kuldevta`. Validate the identify and chat endpoints end to end against the published RAGFlow agents.

- [ ] **Step 5: Promote to main after verification**

```bash
git checkout main && git pull && git merge TAM-165-kuldevta-khoj && git push
```

**Merge the feature branch into `main` — do not merge `stage` into `main`.** `stage` is 29 commits ahead with unrelated unreleased work that must not reach production. Do not cherry-pick: it duplicates commits under new hashes and causes phantom conflicts later (spec §11). Then run `prisma migrate deploy` and `seed:kuldevta` against production.
