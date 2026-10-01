# Refreshing the registry snapshot from Drive

The data in `data/*.json` is a **committed snapshot**, not a live read. Refresh
it manually when the source workbook changes; do not read Drive at runtime.

## Source

- Google Drive file: `Kuldevta-Registry-v0.2.xlsx`
- File ID: `1oWWElX4v9F50uV10Dyhi7zw6tBR9_vmK`
- Read it with the Drive MCP tool `read_file_content` (or equivalent), **not**
  the CSV export. The workbook's CSV export is double-encoded and destroys
  every Devanagari string (e.g. `khandoba.nameDevanagari` should come back as
  `खंडोबा`; the CSV mangles this). Drive's native read returns clean UTF-8.
- Ignore the `Summary` tab entirely — its formulas are broken (it reports
  "Persona enabled: 0" while all 33 rows are `TRUE`).
- The `Archetypes` tab's "Deities routed here" column is illustrative prose
  only, and names deities that are not in the registry (e.g. Srinathji,
  Bhairav, Balaknath as separate entries). It is not a data source — the
  authoritative deity → archetype link is the `archetype` column on each
  deity row.

## Transform rules

Apply these exactly when regenerating `data/deities.json`,
`data/archetypes.json`, and `data/region-defaults.json`:

1. **Lists are semicolon-separated, not comma-separated.** Split
   `Aliases`, `Communities`, `States`, `Epithets`, `Festivals`, `Offerings`,
   and `Niyam` on `;`, trim each element, and drop empty elements.
   `weekly_day` and `tone_notes` are kept as single strings (never split)
   even when their value happens to contain a semicolon or comma — the
   type is `string | null`, not `string[]`.
2. **Em-dash (`—`) means null.** Map it to `null` for `form_of`,
   `temple_village`, `temple_district`, `temple_state`, and `weekly_day`
   (and for any other single-value field where it appears, e.g. `notes`).
3. **`persona_enabled`**: `"TRUE"` → `true`, `"FALSE"` → `false`.
4. **Apply the v1 operational layer.** The workbook does not contain
   `is_active`, `is_fallback`, or `human_reviewed` — these are v1 decisions
   layered on top of the raw registry (spec §6.1), not something to infer
   from the sheet:
   - Every deity defaults to `active: true`, `humanReviewed: true`,
     `isFallback: false`.
   - `kuldevi_anaam`: `active: false`.
   - `hanuman_ji`: `isFallback: true`.
   - Region default `ALL`: `defaultDeityId: "hanuman_ji"`,
     `isNationalFallback: true`. The workbook's `ALL` row currently says
     `kuldevi_anaam` — that value is stale (spec §6.1); always override it
     to `hanuman_ji` regardless of what the sheet says.
   - All other region default rows: `isNationalFallback: false`.
5. **`narayani_devi.personaEnabled` stays `true`.** There is a pending
   legal review on this deity (do not have the persona narrate or valorise
   sati — see the deity's `notes` field and the workbook's guardrail
   callout), but the flag itself is not flipped for that review; leave it
   as the workbook has it (spec §9.2, deferred to counsel).

## Regenerating

1. Read the workbook via Drive (`fileId` above).
2. Re-derive the three JSON files by hand or script, applying the rules
   above row by row.
3. Run `pnpm vitest run packages/kuldevta-registry` and confirm all tests
   pass, in particular:
   - counts: 33 deities / 12 archetypes / 8 region defaults,
   - Devanagari strings are intact (spot-check `khandoba`),
   - every `deity.archetype` resolves to a real archetype id,
   - every `regionDefault.defaultDeityId` resolves to a real deity id,
   - the v1 overrides above are still applied.
4. Commit `data/*.json` together with any test/type changes.
