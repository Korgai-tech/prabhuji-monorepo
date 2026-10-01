import * as React from 'react';

import { IMAGE_TYPES, VIDEO_TYPES, mediaField } from '@/components/media';
import { localeLabel } from '@/components/translations/locales';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { errorMessage } from '@/lib/api-error';
import { isConflictError, notify } from '@/lib/toast';

import {
  type HeroDraft,
  type LocaleDraft,
  type LocaleErrors,
  LOCALE_TEXT_FIELDS,
  NO_LOCALE_ERRORS,
  NO_VERSION_GATE,
  appVersionSchema,
  compareAppVersions,
  diffLocale,
  draftFromTranslation,
  heroLimit,
  isLocaleDirty,
  localeHasErrors,
  newHeroDraft,
  toPatchLocale,
  validateLocale,
} from './paywall-schema';
import {
  PAYWALL_LAYOUTS,
  PAYWALL_LAYOUT_LABELS,
  type PaywallConfig,
  type PaywallConfigPatchBody,
  type PaywallListItem,
  type PaywallLocalePatchRow,
  type PaywallTranslation,
  isPaywallLayout,
  usePaywallConfig,
  usePaywallConfigs,
  useUpdatePaywallConfig,
} from './use-paywall-config';

/**
 * ════════════════════════════════════════════════════════════════════════════
 *  Paywalls — pick a variant, then edit it (TAM-159).
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Replaces TAM-130's single hero-video editor. The four A/B variants are rows in
 * `paywall_configs`; this screen lists them and edits one at a time.
 *
 * There is NO create button, deliberately: a new paywall id does nothing until
 * the bucket map in `paywall.buckets.ts` routes traffic to it, and that is code.
 * Creation therefore ships with the seed, where it is reviewable.
 *
 * The form is HAND-ROLLED rather than an `<EntityForm>` — the same reason as
 * TAM-130, now several times stronger: `<EntityForm>` keys errors by
 * `issue.path[0]`, so one `translations` array field would collapse "the Hindi
 * hero's second item has no media ID" into a single message under the whole card
 * stack, with no indication of which locale, which row, or which field it means.
 * Per-locale cards with per-field messages are less code than working around it.
 *
 * SCOPE — layout, `minAppVersion`, the per-locale shell copy and the
 * ordered hero list. Plans, pricing, `displayPriceText` and legal links are not
 * on this contract; they stay ops-managed. Benefit ICONS are bundled app assets
 * keyed by name, not content — there is nothing here to upload.
 */
export function PaywallPage() {
  const { data: paywalls, isLoading, isError, error, refetch } = usePaywallConfigs();
  const [selected, setSelected] = React.useState<string | null>(null);

  return (
    <div className="grid max-w-4xl gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Paywalls</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          The VIP membership screens and their creatives, per language. Which
          users see which paywall is set in code, not here. Saved changes reach
          the apps within about 5 minutes.
        </p>
      </div>

      {isLoading && <Skeleton className="h-40 w-full" />}

      {isError && (
        <Alert variant="destructive" role="alert">
          <AlertTitle>Could not load the paywalls</AlertTitle>
          <AlertDescription>
            <p>{errorMessage(error, 'Please try again.')}</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => void refetch()}>
              Try again
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {paywalls && (
        <PaywallList items={paywalls} selected={selected} onSelect={setSelected} />
      )}

      {/* Keyed by the SELECTED id (not by `updatedAt`): switching paywalls must
          start a clean editor, but a refetch of the SAME paywall must not — that
          would discard a URL an upload just produced and orphan the S3 object. */}
      {selected !== null && <PaywallConfigLoader key={selected} paywallId={selected} />}
    </div>
  );
}

function PaywallList({
  items,
  selected,
  onSelect,
}: {
  items: PaywallListItem[];
  selected: string | null;
  onSelect: (paywallId: string) => void;
}) {
  if (items.length === 0) {
    return (
      <Alert variant="destructive" role="alert">
        <AlertTitle>No paywalls found</AlertTitle>
        <AlertDescription>
          Paywalls are seeded, not created here. Run the paywall seed first.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Paywall</TableHead>
          <TableHead>Layout</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Min app version</TableHead>
          <TableHead>Config version</TableHead>
          <TableHead>Last updated</TableHead>
          <TableHead />
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((item) => (
          <TableRow key={item.paywallId} data-selected={item.paywallId === selected || undefined}>
            <TableCell className="font-medium">{item.paywallId}</TableCell>
            <TableCell>{layoutLabel(item.layout)}</TableCell>
            <TableCell>
              <Badge variant={item.enabled ? 'default' : 'muted'}>
                {item.enabled ? 'Enabled' : 'Disabled'}
              </Badge>
            </TableCell>
            <TableCell>
              {item.minAppVersion === NO_VERSION_GATE ? (
                <span title="No gate — every app version is eligible">
                  {NO_VERSION_GATE} · no gate
                </span>
              ) : (
                item.minAppVersion
              )}
            </TableCell>
            <TableCell>{item.configVersion}</TableCell>
            <TableCell>
              <time dateTime={item.updatedAt}>
                {new Date(item.updatedAt).toLocaleDateString()}
              </time>
            </TableCell>
            <TableCell className="text-right">
              <Button
                type="button"
                variant={item.paywallId === selected ? 'default' : 'outline'}
                size="sm"
                onClick={() => onSelect(item.paywallId)}
              >
                {item.paywallId === selected ? 'Editing' : 'Edit'}
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

/** `card_hero` → its editor label; an unknown (newer) layout shows its raw id. */
function layoutLabel(layout: string): string {
  return isPaywallLayout(layout) ? PAYWALL_LAYOUT_LABELS[layout] : layout;
}

function PaywallConfigLoader({ paywallId }: { paywallId: string }) {
  const { data: config, isLoading, isError, error, refetch } = usePaywallConfig(paywallId);

  if (isLoading) return <Skeleton className="h-64 w-full" />;

  if (isError) {
    return (
      <Alert variant="destructive" role="alert">
        <AlertTitle>Could not load {paywallId}</AlertTitle>
        <AlertDescription>
          <p>{errorMessage(error, 'Please try again.')}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => void refetch()}>
            Try again
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  return config ? <PaywallEditor config={config} /> : null;
}

/**
 * The media adapters are module-scope literals on purpose: `check-media-targets`
 * greps `mediaField({...})` call sites statically, so building the triple
 * dynamically would take these fields out of that gate's reach.
 *
 * `paywall.paywallHeroMedia.url` accepts images OR video server-side, so it is
 * not in the client's accept mirror and `accept` must be passed. Two adapters,
 * one per media type, so the size cap and the preview element (`<img>` vs
 * `<video>`) match the row the editor is actually filling in.
 */
const renderHeroImage = mediaField({
  module: 'paywall',
  entity: 'paywallHeroMedia',
  field: 'url',
  accept: IMAGE_TYPES,
});

const renderHeroVideo = mediaField({
  module: 'paywall',
  entity: 'paywallHeroMedia',
  field: 'url',
  accept: VIDEO_TYPES,
});

const renderHeroThumbnail = mediaField({
  module: 'paywall',
  entity: 'paywallHeroMedia',
  field: 'thumbnailUrl',
});

type DraftsByLocale = Record<string, LocaleDraft>;

function toDrafts(translations: readonly PaywallTranslation[]): DraftsByLocale {
  const out: DraftsByLocale = {};
  for (const t of translations) out[t.locale] = draftFromTranslation(t);
  return out;
}

function PaywallEditor({ config }: { config: PaywallConfig }) {
  const update = useUpdatePaywallConfig(config.paywallId);

  const originals = React.useMemo(() => toDrafts(config.translations), [config.translations]);

  const [layout, setLayout] = React.useState(config.layout);
  const [minAppVersion, setMinAppVersion] = React.useState(config.minAppVersion);
  const [drafts, setDrafts] = React.useState<DraftsByLocale>(() => toDrafts(config.translations));

  // This component is deliberately NOT remounted when a refetch lands (no
  // `key={config.updatedAt}` at its call site). A refetch after an upload would
  // otherwise discard the URL the upload just produced and make the editor do it
  // again — the object would still be in S3, just orphaned. Only the
  // precondition token is re-read from `config`, at save time.

  const dirtyLocales = React.useMemo(
    () =>
      Object.keys(drafts).filter((locale) => {
        const original = originals[locale];
        const draft = drafts[locale];
        return original !== undefined && draft !== undefined && isLocaleDirty(draft, original);
      }),
    [drafts, originals],
  );

  /**
   * Only the carousel takes more than one hero, and the server validates that
   * against the layout the SAVE RESULTS IN. So the limit follows the SELECTED
   * layout, not the stored one — switching carousel→card_hero with three rows
   * staged must go red here, not come back as a 400.
   */
  const limit = heroLimit(layout);

  /**
   * Errors are DERIVED, not state: the hero-count rule depends on the layout
   * dropdown, so a copy of the messages held in state would be stale the moment
   * the layout changed and would only refresh on the next keystroke.
   */
  const errors = React.useMemo(() => {
    const out: Record<string, LocaleErrors> = {};
    for (const [locale, draft] of Object.entries(drafts)) {
      const original = originals[locale];
      if (original) out[locale] = validateLocale(draft, original, limit);
    }
    return out;
  }, [drafts, originals, limit]);

  const hasLocaleErrors = Object.values(errors).some(localeHasErrors);

  const trimmedVersion = minAppVersion.trim();
  const versionParse = appVersionSchema.safeParse(minAppVersion);
  const versionError = versionParse.success
    ? undefined
    : (versionParse.error.issues[0]?.message ?? 'Invalid version');
  const versionDirty = trimmedVersion !== config.minAppVersion;
  // The dangerous direction: a lower gate lets OLDER builds — which may not
  // contain this layout at all — receive this paywall.
  const versionLowered =
    versionDirty && compareAppVersions(minAppVersion, config.minAppVersion) === -1;

  const settingsDirty =
    layout !== config.layout || versionDirty;
  const dirty = settingsDirty || dirtyLocales.length > 0;

  function applyLocale(locale: string, next: LocaleDraft) {
    setDrafts((prev) => ({ ...prev, [locale]: next }));
  }

  function patchLocale(locale: string, patch: Partial<LocaleDraft>) {
    const current = drafts[locale];
    if (!current) return;
    applyLocale(locale, { ...current, ...patch });
  }

  function patchHeroRow(locale: string, key: string, patch: Partial<HeroDraft>) {
    const current = drafts[locale];
    if (!current) return;
    applyLocale(locale, {
      ...current,
      hero: current.hero.map((row) => (row.key === key ? { ...row, ...patch } : row)),
    });
  }

  function moveHeroRow(locale: string, index: number, delta: number) {
    const current = drafts[locale];
    const target = index + delta;
    if (!current || target < 0 || target >= current.hero.length) return;
    const hero = [...current.hero];
    const [row] = hero.splice(index, 1);
    if (row) hero.splice(target, 0, row);
    applyLocale(locale, { ...current, hero });
  }

  function reset() {
    setLayout(config.layout);
    setMinAppVersion(config.minAppVersion);
    setDrafts(toDrafts(config.translations));
  }

  async function save() {
    if (hasLocaleErrors || versionError !== undefined) {
      notify.info('Fix the highlighted fields before saving.');
      return;
    }

    const rows: PaywallLocalePatchRow[] = [];

    for (const t of config.translations) {
      const original = originals[t.locale];
      const draft = drafts[t.locale];
      if (!original || !draft || !isLocaleDirty(draft, original)) continue;

      // Reads are tolerant (`z.string()`), writes are strict — narrow before
      // sending. Unreachable in practice: both lists derive from the API's
      // `LanguageCodeSchema`. Surfaced rather than dropped, so a mismatch is not
      // a Save button that silently does nothing.
      const patchLocaleCode = toPatchLocale(t.locale);
      if (patchLocaleCode === null) {
        notify.error(
          undefined,
          `This admin build does not know the locale "${t.locale}" — it cannot be saved.`,
        );
        return;
      }

      const row = diffLocale(patchLocaleCode, draft, original);
      if (row) rows.push(row);
    }

    const body: PaywallConfigPatchBody = { expectedUpdatedAt: config.updatedAt };
    if (layout !== config.layout && isPaywallLayout(layout)) body.layout = layout;
    if (versionDirty) body.minAppVersion = trimmedVersion;
    if (rows.length > 0) body.translations = rows;

    if (
      body.layout === undefined &&
      body.minAppVersion === undefined &&
      body.translations === undefined
    ) {
      return;
    }

    try {
      await update.mutateAsync(body);
      notify.success('Paywall updated — live in the apps within ~5 minutes');
    } catch (err) {
      if (isConflictError(err)) {
        notify.conflict(
          () => undefined,
          'This paywall was changed by someone else — reload and try again.',
        );
      } else {
        notify.error(err, 'Could not update the paywall.');
      }
    }
  }

  const unsaved = [
    ...(settingsDirty ? ['settings'] : []),
    ...dirtyLocales.map(localeLabel),
  ];

  const layoutOptions: { value: string; label: string }[] = PAYWALL_LAYOUTS.map((value) => ({
    value,
    label: PAYWALL_LAYOUT_LABELS[value],
  }));
  if (!isPaywallLayout(config.layout)) {
    // A layout this CMS build has no label for — keep it selectable so switching
    // away is possible and the stored value is never misreported.
    layoutOptions.unshift({
      value: config.layout,
      label: `${config.layout} (unknown to this admin build)`,
    });
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>{config.paywallId}</CardTitle>
          <CardDescription>
            Version {config.configVersion} · default plan{' '}
            {config.defaultPlanId ?? '—'} · shimmer{' '}
            {config.shimmerEnabled ? 'on' : 'off'}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6">
          <div className="grid gap-2">
            <Label htmlFor="paywall-layout">Layout</Label>
            <Select
              id="paywall-layout"
              value={layout}
              disabled={update.isPending}
              onChange={(e) => setLayout(e.target.value)}
            >
              {layoutOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
            <p className="text-xs text-muted-foreground">
              Which built screen renders this paywall. An app that does not know
              the chosen layout falls back to the card hero.{' '}
              {limit === 1
                ? 'This layout shows ONE hero item per language.'
                : 'The carousel shows every hero item, in order.'}
            </p>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="paywall-min-version">Minimum app version</Label>
            <Input
              id="paywall-min-version"
              value={minAppVersion}
              inputMode="numeric"
              placeholder="1.1.0"
              className="max-w-40"
              disabled={update.isPending}
              aria-invalid={versionError !== undefined || undefined}
              aria-describedby="paywall-min-version-hint"
              onChange={(e) => setMinAppVersion(e.target.value)}
            />
            {versionError ? (
              <p id="paywall-min-version-hint" role="alert" className="text-xs text-destructive">
                {versionError}
              </p>
            ) : (
              <p id="paywall-min-version-hint" className="text-xs text-muted-foreground">
                The lowest app version allowed to see this screen. Anything older
                gets the default paywall instead.{' '}
                {trimmedVersion === NO_VERSION_GATE
                  ? 'It is 0.0.0, so there is NO gate — every install, including builds that predate this layout, is eligible.'
                  : 'Set it to 0.0.0 to remove the gate entirely.'}
              </p>
            )}
            {versionLowered && (
              <Alert variant="destructive" role="alert">
                <AlertTitle>You are lowering the gate</AlertTitle>
                <AlertDescription>
                  <p>
                    From {config.minAppVersion} to {trimmedVersion || '—'}. Builds
                    between the two will start receiving this paywall. If the{' '}
                    <code>{layout}</code> layout is not in those builds, those
                    users get a screen their app cannot draw — check the release
                    that shipped it before saving.
                  </p>
                </AlertDescription>
              </Alert>
            )}
          </div>

          {/*
            `enabled` is read-only context, not a control. The column still
            exists and the resolver honours it, but parking a variant is done by
            raising its minimum app version above every shipped build — one
            concept instead of two ways to disable the same screen.
          */}
          <div className="flex items-center justify-between gap-4 rounded-md border p-4">
            <div className="grid gap-0.5">
              <span className="text-sm font-medium">Status</span>
              <span className="text-xs text-muted-foreground">
                {config.enabled
                  ? 'Live. To park this paywall, raise its minimum app version above every shipped build.'
                  : 'Disabled outside the CMS. Users bucketed here get the default paywall.'}
              </span>
            </div>
            <Badge variant={config.enabled ? 'default' : 'muted'}>
              {config.enabled ? 'Enabled' : 'Disabled'}
            </Badge>
          </div>
        </CardContent>
      </Card>

      {config.translations.length === 0 && (
        <Alert variant="destructive" role="alert">
          <AlertTitle>No paywall copy found</AlertTitle>
          <AlertDescription>
            This paywall has no translation rows, so there is nothing to attach
            copy or media to. Seed the paywall copy first.
          </AlertDescription>
        </Alert>
      )}

      {config.translations.map((t) => {
        const draft = drafts[t.locale];
        if (!draft) return null;
        return (
          <LocaleCard
            key={t.locale}
            locale={t.locale}
            draft={draft}
            errors={errors[t.locale] ?? NO_LOCALE_ERRORS}
            heroLimit={limit}
            disabled={update.isPending}
            onPatch={(patch) => patchLocale(t.locale, patch)}
            onPatchHero={(key, patch) => patchHeroRow(t.locale, key, patch)}
            onMoveHero={(index, delta) => moveHeroRow(t.locale, index, delta)}
          />
        );
      })}

      <div className="flex items-center gap-2">
        <Button type="button" disabled={!dirty || update.isPending} onClick={() => void save()}>
          {update.isPending ? 'Saving…' : 'Save changes'}
        </Button>
        {dirty && (
          <Button type="button" variant="outline" disabled={update.isPending} onClick={reset}>
            Reset
          </Button>
        )}
        <span className="text-xs text-muted-foreground">
          {unsaved.length === 0 ? 'No unsaved changes.' : `Unsaved: ${unsaved.join(', ')}`}
        </span>
      </div>
    </>
  );
}

function LocaleCard({
  locale,
  draft,
  errors,
  heroLimit: limit,
  disabled,
  onPatch,
  onPatchHero,
  onMoveHero,
}: {
  locale: string;
  draft: LocaleDraft;
  errors: LocaleErrors;
  /** How many hero rows the SELECTED layout takes — 1 for everything but the carousel. */
  heroLimit: number;
  disabled: boolean;
  onPatch: (patch: Partial<LocaleDraft>) => void;
  onPatchHero: (key: string, patch: Partial<HeroDraft>) => void;
  onMoveHero: (index: number, delta: number) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{localeLabel(locale)}</CardTitle>
        <CardDescription>Shell copy and hero media for this language.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6">
        {LOCALE_TEXT_FIELDS.map((field) => {
          const inputId = `paywall-${field.name}-${locale}`;
          const message = errors.fields[field.name];
          return (
            <div key={field.name} className="grid gap-2">
              <Label htmlFor={inputId}>{field.label}</Label>
              <Input
                id={inputId}
                value={draft[field.name]}
                maxLength={field.max}
                disabled={disabled}
                aria-invalid={message !== undefined || undefined}
                aria-describedby={`${inputId}-hint`}
                onChange={(e) => onPatch({ [field.name]: e.target.value })}
              />
              {message ? (
                <p id={`${inputId}-hint`} role="alert" className="text-xs text-destructive">
                  {message}
                </p>
              ) : (
                <p id={`${inputId}-hint`} className="text-xs text-muted-foreground">
                  {field.hint}
                </p>
              )}
            </div>
          );
        })}

        <fieldset className="grid gap-4">
          <legend className="text-sm font-medium">Hero media</legend>
          <p className="text-xs text-muted-foreground">
            {limit === 1
              ? 'The selected layout shows a single hero item. Only the carousel takes more than one.'
              : 'Shown in order, top first. The carousel shows all of them.'}
          </p>

          {errors.heroCount && (
            <Alert variant="destructive" role="alert">
              <AlertTitle>Too many hero items for this layout</AlertTitle>
              <AlertDescription>
                <p>{errors.heroCount}</p>
              </AlertDescription>
            </Alert>
          )}

          {draft.hero.length === 0 && (
            <p className="text-xs text-muted-foreground">
              No hero media for this language yet.
            </p>
          )}

          {draft.hero.map((row, index) => (
            <HeroRow
              key={row.key}
              locale={locale}
              row={row}
              index={index}
              total={draft.hero.length}
              errors={errors.hero[row.key] ?? {}}
              disabled={disabled}
              onPatch={(patch) => onPatchHero(row.key, patch)}
              onMove={(delta) => onMoveHero(index, delta)}
              onRemove={() =>
                onPatch({ hero: draft.hero.filter((other) => other.key !== row.key) })
              }
            />
          ))}

          {/* No "add" once the layout's quota is used up: for the three
              single-hero layouts the extra rows would be stored, never drawn,
              and rejected by the server on the next save. */}
          {draft.hero.length < limit ? (
            <div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={disabled}
                onClick={() => onPatch({ hero: [...draft.hero, newHeroDraft()] })}
              >
                Add hero item
              </Button>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              {limit === 1
                ? 'This layout takes one hero item. Switch the layout to the carousel to add more.'
                : `At most ${limit} hero items.`}
            </p>
          )}
        </fieldset>
      </CardContent>
    </Card>
  );
}

function HeroRow({
  locale,
  row,
  index,
  total,
  errors,
  disabled,
  onPatch,
  onMove,
  onRemove,
}: {
  locale: string;
  row: HeroDraft;
  index: number;
  total: number;
  errors: { url?: string; mediaId?: string };
  disabled: boolean;
  onPatch: (patch: Partial<HeroDraft>) => void;
  onMove: (delta: number) => void;
  onRemove: () => void;
}) {
  const base = `paywall-hero-${locale}-${index}`;
  const typeId = `${base}-type`;
  const assetId = `${base}-asset`;
  const thumbId = `${base}-thumbnail`;
  const mediaIdId = `${base}-media-id`;
  const renderAsset = row.mediaType === 'video' ? renderHeroVideo : renderHeroImage;

  return (
    <div className="grid gap-4 rounded-md border p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">Item {index + 1}</span>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled || index === 0}
            aria-label={`Move item ${index + 1} up`}
            onClick={() => onMove(-1)}
          >
            Up
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled || index === total - 1}
            aria-label={`Move item ${index + 1} down`}
            onClick={() => onMove(1)}
          >
            Down
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled}
            aria-label={`Remove item ${index + 1}`}
            onClick={onRemove}
          >
            Remove
          </Button>
        </div>
      </div>

      <div className="grid gap-2">
        <Label htmlFor={typeId}>Type</Label>
        <Select
          id={typeId}
          value={row.mediaType}
          disabled={disabled}
          onChange={(e) =>
            // The asset is cleared with the type: the app renders by `mediaType`,
            // so an image row pointing at an .mp4 is a broken hero nobody sees
            // until it ships. Clearing makes that state unsaveable (a row with no
            // URL fails validation) instead of merely unlikely.
            onPatch({
              mediaType: e.target.value === 'video' ? 'video' : 'image',
              url: '',
            })
          }
        >
          <option value="image">Image</option>
          <option value="video">Video</option>
        </Select>
      </div>

      <div className="grid gap-2">
        <Label htmlFor={assetId}>{row.mediaType === 'video' ? 'Video' : 'Image'}</Label>
        {renderAsset({
          id: assetId,
          name: `${locale}.hero.${index}.url`,
          value: row.url,
          onChange: (value) => onPatch({ url: asUrl(value) ?? '' }),
          disabled,
          invalid: errors.url !== undefined,
          describedBy: errors.url ? `${assetId}-error` : undefined,
          // No enclosing <EntityForm>: this row is hand-rolled, so there are no
          // sibling field values to hand a cross-field reader.
          values: {},
        })}
        {errors.url && (
          <p id={`${assetId}-error`} role="alert" className="text-xs text-destructive">
            {errors.url}
          </p>
        )}
      </div>

      <div className="grid gap-2">
        <Label htmlFor={thumbId}>Poster image</Label>
        {renderHeroThumbnail({
          id: thumbId,
          name: `${locale}.hero.${index}.thumbnailUrl`,
          value: row.thumbnailUrl ?? '',
          onChange: (value) => onPatch({ thumbnailUrl: asUrl(value) }),
          disabled,
          invalid: false,
          describedBy: undefined,
          values: {},
        })}
        <p className="text-xs text-muted-foreground">
          Optional. Shown while a video loads, and if it fails to play.
        </p>
      </div>

      <div className="grid gap-2">
        <Label htmlFor={mediaIdId}>Media ID</Label>
        <Input
          id={mediaIdId}
          value={row.mediaId}
          disabled={disabled}
          placeholder="vip_intro_v2"
          aria-invalid={errors.mediaId !== undefined || undefined}
          aria-describedby={`${mediaIdId}-hint`}
          onChange={(e) => onPatch({ mediaId: e.target.value })}
        />
        {errors.mediaId ? (
          <p id={`${mediaIdId}-hint`} role="alert" className="text-xs text-destructive">
            {errors.mediaId}
          </p>
        ) : (
          <p id={`${mediaIdId}-hint`} className="text-xs text-muted-foreground">
            Identifies this creative in analytics. Give a new asset a new ID.
          </p>
        )}
      </div>
    </div>
  );
}

/** `<MediaUploadField>` types its value as `unknown`; it only ever emits a URL string. */
function asUrl(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}
