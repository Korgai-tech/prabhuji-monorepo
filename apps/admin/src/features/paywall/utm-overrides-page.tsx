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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ApiError, errorMessage } from '@/lib/api-error';
import { notify } from '@/lib/toast';

import { type PaywallBenefitChoice, usePaywallBenefitChoices } from './use-paywall-config';
import {
  MAX_OVERRIDE_BENEFITS,
  NO_LOCALE_ERRORS,
  OVERRIDE_LOCALES,
  type BenefitDraft,
  type LocaleDraft,
  type LocaleErrors,
  type OverrideDraft,
  type OverrideErrors,
  diffOverride,
  draftFromOverride,
  hasOverrideErrors,
  isOverrideDirty,
  localeSummary,
  newOverrideDraft,
  overriddenLocales,
  toCreateBody,
  validateOverride,
} from './utm-override-schema';
import {
  type UtmOverride,
  useCreateUtmOverride,
  useDeleteUtmOverride,
  useUpdateUtmOverride,
  useUtmOverride,
  useUtmOverrides,
} from './use-utm-overrides';

/**
 * ════════════════════════════════════════════════════════════════════════════
 *  Ad group paywall overrides — the CMS surface for campaign treatments.
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Sibling of `paywall-page.tsx`, and hand-rolled for the same reason:
 * `<EntityForm>` keys errors by `issue.path[0]`, so one `overrides` field would
 * collapse "Hindi's media has no ID" into a single message under the whole
 * document.
 *
 * The mental model this page has to teach, because it is not obvious: a row here
 * is a PATCH OVER THE DEFAULT PAYWALL, not a paywall. Every field is optional
 * and an empty one means "keep whatever the CMS says". That is why nothing on
 * this form is required except the ad group name itself.
 *
 * SCOPE — ad group, enabled, and PER LOCALE the two things a campaign dresses:
 * the one hero media the default paywall carries, and the BENEFIT LIST (which of
 * the paywall's benefits show, in what order, under what names). Nothing else:
 * an override cannot point at a different paywall, and the paywall's four copy
 * lines are gone from this contract — they are the product's own voice.
 *
 * The benefit list REPLACES the paywall's rather than patching it, so its order
 * is the render order and "show three of the eight" is one edit.
 */
export function UtmOverridesPage() {
  const { data: rows, isLoading, isError, error, refetch } = useUtmOverrides();
  const [selected, setSelected] = React.useState<Selection>(null);
  const [pendingDelete, setPendingDelete] = React.useState<UtmOverride | null>(null);

  return (
    <div className="grid max-w-4xl gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Ad group paywall overrides</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Campaign treatments, keyed by the ad group name from the ad platform.
          The name is matched <span className="font-medium">exactly</span>{' '}
          against the user’s most recent attribution touch — spaces, capitals and
          punctuation are all normal, so paste it rather than retyping it. A user
          whose ad group matches an <span className="font-medium">enabled</span>{' '}
          row gets the <span className="font-medium">default paywall</span> with
          these fields patched over it, and{' '}
          <span className="font-medium">skips the A/B variant entirely</span>.
          Everyone else is bucketed as before. Overrides apply to the default
          paywall only — no other paywall can be selected or edited here. Saved
          changes reach the apps within about 5 minutes.
        </p>
      </div>

      {isLoading && <Skeleton className="h-40 w-full" />}

      {isError && (
        <Alert variant="destructive" role="alert">
          <AlertTitle>Could not load the ad group overrides</AlertTitle>
          <AlertDescription>
            <p>{errorMessage(error, 'Please try again.')}</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => void refetch()}>
              Try again
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {rows && (
        <OverrideList
          rows={rows}
          selected={selected}
          onSelect={setSelected}
          onDelete={setPendingDelete}
        />
      )}

      {/* Keyed by the selection so switching rows starts a clean editor — but a
          refetch of the SAME row must not remount, or a URL an upload just
          produced would be discarded and the S3 object orphaned. */}
      {selected?.mode === 'create' && (
        <CreateOverrideEditor key="create" onDone={() => setSelected(null)} />
      )}
      {selected?.mode === 'edit' && (
        <EditOverrideLoader
          key={selected.id}
          id={selected.id}
          onDone={() => setSelected(null)}
        />
      )}

      <DeleteOverrideDialog row={pendingDelete} onClose={() => setPendingDelete(null)} />
    </div>
  );
}

type Selection = { mode: 'create' } | { mode: 'edit'; id: string } | null;

function OverrideList({
  rows,
  selected,
  onSelect,
  onDelete,
}: {
  rows: UtmOverride[];
  selected: Selection;
  onSelect: (selection: Selection) => void;
  onDelete: (row: UtmOverride) => void;
}) {
  return (
    <div className="grid gap-3">
      <div>
        <Button
          type="button"
          size="sm"
          variant={selected?.mode === 'create' ? 'default' : 'outline'}
          onClick={() => onSelect({ mode: 'create' })}
        >
          New ad group override
        </Button>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No ad group overrides yet — every user is bucketed by the phone-number
          A/B split.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Ad group</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Languages</TableHead>
              <TableHead>Media</TableHead>
              <TableHead>Benefits</TableHead>
              <TableHead>Last updated</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => {
              const editing = selected?.mode === 'edit' && selected.id === row.id;
              const locales = Object.values(row.overrides.locales);
              const mediaCount = locales.filter((entry) => entry.media !== undefined).length;
              const benefitCount = locales.filter(
                (entry) => entry.benefits !== undefined,
              ).length;
              return (
                <TableRow key={row.id} data-selected={editing || undefined}>
                  <TableCell className="font-medium">{row.utmGroup}</TableCell>
                  <TableCell>
                    <Badge variant={row.enabled ? 'default' : 'muted'}>
                      {row.enabled ? 'Enabled' : 'Disabled'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {locales.length === 0 ? '—' : `${locales.length} language(s)`}
                  </TableCell>
                  <TableCell>
                    {mediaCount === 0 ? '—' : `${mediaCount} replaced`}
                  </TableCell>
                  <TableCell>
                    {benefitCount === 0 ? '—' : `${benefitCount} custom list(s)`}
                  </TableCell>
                  <TableCell>
                    <time dateTime={row.updatedAt}>
                      {new Date(row.updatedAt).toLocaleDateString()}
                    </time>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        type="button"
                        variant={editing ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => onSelect({ mode: 'edit', id: row.id })}
                      >
                        {editing ? 'Editing' : 'Edit'}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        aria-label={`Delete ${row.utmGroup}`}
                        onClick={() => onDelete(row)}
                      >
                        Delete
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

function EditOverrideLoader({ id, onDone }: { id: string; onDone: () => void }) {
  const { data: row, isLoading, isError, error, refetch } = useUtmOverride(id);

  if (isLoading) return <Skeleton className="h-64 w-full" />;

  if (isError) {
    return (
      <Alert variant="destructive" role="alert">
        <AlertTitle>
          {error instanceof ApiError && error.isNotFound
            ? 'This ad group override no longer exists'
            : 'Could not load this ad group override'}
        </AlertTitle>
        <AlertDescription>
          <p>{errorMessage(error, 'Please try again.')}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => void refetch()}>
            Try again
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  return row ? <EditOverrideEditor row={row} onDone={onDone} /> : null;
}

/**
 * The media adapters are module-scope literals on purpose: `check-media-targets`
 * greps `mediaField({...})` call sites statically, so building the triple
 * dynamically would take these fields out of that gate's reach. Same two
 * allowlist triples the paywall editor uses — an override's media IS the default
 * paywall's hero media, just stored on a different row.
 *
 * There is deliberately NO adapter for a benefit icon: `icon` is a bundled asset
 * KEY the app compiles in, not a URL, so there is nothing to upload.
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

function CreateOverrideEditor({ onDone }: { onDone: () => void }) {
  const create = useCreateUtmOverride();
  const [draft, setDraft] = React.useState<OverrideDraft>(newOverrideDraft);

  const errors = React.useMemo(() => validateOverride(draft), [draft]);

  async function save() {
    if (hasOverrideErrors(errors)) {
      notify.info('Fix the highlighted fields before saving.');
      return;
    }
    try {
      await create.mutateAsync(toCreateBody(draft));
      notify.success('Ad group override created — live in the apps within ~5 minutes');
      onDone();
    } catch (err) {
      notify.error(err, conflictCopy(err, 'Could not create the ad group override.'));
    }
  }

  return (
    <OverrideForm
      title="New ad group override"
      description="Every field except the ad group name is optional — an empty one keeps whatever the default paywall’s CMS says."
      draft={draft}
      errors={errors}
      busy={create.isPending}
      dirty
      saveLabel="Create override"
      onChange={setDraft}
      onSave={() => void save()}
      onCancel={onDone}
    />
  );
}

function EditOverrideEditor({ row, onDone }: { row: UtmOverride; onDone: () => void }) {
  const update = useUpdateUtmOverride(row.id);
  const original = React.useMemo(() => draftFromOverride(row), [row]);
  const [draft, setDraft] = React.useState<OverrideDraft>(() => draftFromOverride(row));

  const errors = React.useMemo(() => validateOverride(draft), [draft]);
  const dirty = isOverrideDirty(draft, original);

  async function save() {
    if (hasOverrideErrors(errors)) {
      notify.info('Fix the highlighted fields before saving.');
      return;
    }
    const body = diffOverride(draft, original);
    if (body === null) return;
    try {
      await update.mutateAsync(body);
      notify.success('Ad group override saved — live in the apps within ~5 minutes');
    } catch (err) {
      notify.error(err, conflictCopy(err, 'Could not save the ad group override.'));
    }
  }

  return (
    <OverrideForm
      title={row.utmGroup}
      description={`Created ${new Date(row.createdAt).toLocaleDateString()} · last updated ${new Date(row.updatedAt).toLocaleDateString()}`}
      draft={draft}
      errors={errors}
      busy={update.isPending}
      dirty={dirty}
      saveLabel="Save changes"
      onChange={setDraft}
      onSave={() => void save()}
      // CLOSES the editor, as it does on create — it does not merely revert the
      // draft. Reverting looked like a dead button whenever nothing had been
      // edited yet, which is the state a freshly opened row is always in.
      // Closing unmounts the draft, so it is also the discard.
      onCancel={onDone}
    />
  );
}

/**
 * The 409 on this contract is `ALREADY_EXISTS` (one row per ad group), NOT the
 * `STALE_WRITE` of ADR C3 — this API takes no `expectedUpdatedAt`. Different
 * cause, so different copy; a "reload and try again" toast would be a lie.
 */
function conflictCopy(error: unknown, fallback: string): string {
  return error instanceof ApiError && error.status === 409
    ? 'That ad group already has an override — edit the existing row instead.'
    : fallback;
}

function OverrideForm({
  title,
  description,
  draft,
  errors,
  busy,
  dirty,
  saveLabel,
  onChange,
  onSave,
  onCancel,
}: {
  title: string;
  description: string;
  draft: OverrideDraft;
  errors: OverrideErrors;
  busy: boolean;
  dirty: boolean;
  saveLabel: string;
  onChange: (next: OverrideDraft) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  function patch(values: Partial<OverrideDraft>) {
    onChange({ ...draft, ...values });
  }

  const touched = overriddenLocales(draft);

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6">
          <div className="grid gap-2">
            <Label htmlFor="utm-group">Ad group name</Label>
            <Input
              id="utm-group"
              value={draft.utmGroup}
              disabled={busy}
              placeholder="Diwali Prospecting — Broad"
              aria-invalid={errors.utmGroup !== undefined || undefined}
              aria-describedby="utm-group-hint"
              onChange={(e) => patch({ utmGroup: e.target.value })}
            />
            {errors.utmGroup ? (
              <p id="utm-group-hint" role="alert" className="text-xs text-destructive">
                {errors.utmGroup}
              </p>
            ) : (
              <p id="utm-group-hint" className="text-xs text-muted-foreground">
                Copied verbatim from the ad platform. Matched exactly — a
                different capitalisation is a different ad group and matches
                nobody.
              </p>
            )}
          </div>

          <div className="flex items-center justify-between gap-4 rounded-md border p-4">
            <div className="grid gap-0.5">
              <Label htmlFor="utm-enabled">Enabled</Label>
              <span className="text-xs text-muted-foreground">
                Off means the override is ignored and this ad group’s users go
                back to the phone-number A/B split — without deleting the row.
              </span>
            </div>
            <Switch
              id="utm-enabled"
              checked={draft.enabled}
              disabled={busy}
              onCheckedChange={(checked) => patch({ enabled: checked === true })}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Per-language overrides</CardTitle>
          <CardDescription>
            One hero item and the benefit list per language — the two things a
            campaign dresses. Anything left empty keeps the paywall’s own, for
            that language only: filling just one language leaves the other
            showing the standard paywall, it does not borrow across.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2">
          {OVERRIDE_LOCALES.map((locale) => (
            <LocaleSection
              key={locale}
              locale={locale}
              draft={draft}
              errors={errors}
              disabled={busy}
              onPatch={(next) =>
                patch({ locales: { ...draft.locales, [locale]: next } })
              }
            />
          ))}
          <p className="text-xs text-muted-foreground">
            {touched.length === 0
              ? 'Nothing overridden — every language keeps the default paywall’s own media and benefits.'
              : `Overridden: ${touched.map(localeLabel).join(', ')}.`}
          </p>
        </CardContent>
      </Card>

      <div className="flex items-center gap-2">
        <Button type="button" disabled={!dirty || busy} onClick={onSave}>
          {busy ? 'Saving…' : saveLabel}
        </Button>
        <Button type="button" variant="outline" disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
        <span className="text-xs text-muted-foreground">
          {dirty ? 'Unsaved changes.' : 'No unsaved changes.'}
        </span>
      </div>
    </>
  );
}

/**
 * One language's override, in a native `<details>`.
 *
 * COLLAPSED on open, every language, every time — including ones that already
 * carry overrides. The summary line already says what a language overrides, so
 * the collapsed state is not hiding anything an editor needs to see at a glance,
 * and starting closed keeps the form one screen instead of two walls of media
 * pickers and benefit rows.
 *
 * `<details>` is left UNCONTROLLED — no `open` prop at all — so the browser owns
 * the toggle. Passing `open` without an `onToggle` would let React re-assert its
 * value on any re-render and snap a section the editor just opened shut again.
 */
function LocaleSection({
  locale,
  draft,
  errors,
  disabled,
  onPatch,
}: {
  locale: string;
  draft: OverrideDraft;
  errors: OverrideErrors;
  disabled: boolean;
  onPatch: (next: LocaleDraft) => void;
}) {
  const row = draft.locales[locale];
  const localeErrors: LocaleErrors = errors.locales[locale] ?? NO_LOCALE_ERRORS;

  if (!row) return null;

  const assetId = `utm-media-${locale}`;
  const thumbId = `utm-thumbnail-${locale}`;
  const mediaIdId = `utm-media-id-${locale}`;
  const typeId = `utm-media-type-${locale}`;
  const renderAsset = row.mediaType === 'video' ? renderHeroVideo : renderHeroImage;
  const hasMedia = row.url.length > 0 || row.mediaId.length > 0 || row.thumbnailUrl !== null;

  return (
    <details className="rounded-md border p-4">
      <summary className="cursor-pointer text-sm font-medium">
        {localeLabel(locale)}
        <span className="ml-2 text-xs font-normal text-muted-foreground">
          {localeSummary(draft, locale)}
        </span>
      </summary>

      <div className="mt-4 grid gap-4">
        <div className="grid gap-4 rounded-md border p-4">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium">Media</span>
            {hasMedia && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={disabled}
                aria-label={`Clear ${localeLabel(locale)} media`}
                onClick={() => onPatch({ ...row, url: '', thumbnailUrl: null, mediaId: '' })}
              >
                Clear media
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Optional, and all-or-nothing: a file and a media ID together, or
            neither. Replaces this language’s single hero item on the default
            paywall.
          </p>

          <div className="grid gap-2">
            <Label htmlFor={typeId}>Type</Label>
            <Select
              id={typeId}
              value={row.mediaType}
              disabled={disabled}
              // The asset is cleared with the type: the app renders by
              // `mediaType`, so an image row pointing at an .mp4 is a broken
              // hero nobody sees until it ships.
              onChange={(e) =>
                onPatch({
                  ...row,
                  mediaType: e.target.value === 'image' ? 'image' : 'video',
                  url: '',
                })
              }
            >
              <option value="video">Video</option>
              <option value="image">Image</option>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label htmlFor={assetId}>{row.mediaType === 'video' ? 'Video' : 'Image'}</Label>
            {renderAsset({
              id: assetId,
              name: `locales.${locale}.media.url`,
              value: row.url,
              onChange: (value) => onPatch({ ...row, url: asUrl(value) ?? '' }),
              disabled,
              invalid: localeErrors.url !== undefined,
              describedBy: localeErrors.url ? `${assetId}-error` : undefined,
              // No enclosing <EntityForm>: this row is hand-rolled, so there are no
              // sibling field values to hand a cross-field reader.
              values: {},
            })}
            {localeErrors.url && (
              <p id={`${assetId}-error`} role="alert" className="text-xs text-destructive">
                {localeErrors.url}
              </p>
            )}
          </div>

          <div className="grid gap-2">
            <Label htmlFor={thumbId}>Poster image</Label>
            {renderHeroThumbnail({
              id: thumbId,
              name: `locales.${locale}.media.thumbnailUrl`,
              value: row.thumbnailUrl ?? '',
              onChange: (value) => onPatch({ ...row, thumbnailUrl: asUrl(value) }),
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
              placeholder="diwali_hero_v1"
              aria-invalid={localeErrors.mediaId !== undefined || undefined}
              aria-describedby={`${mediaIdId}-hint`}
              onChange={(e) => onPatch({ ...row, mediaId: e.target.value })}
            />
            {localeErrors.mediaId ? (
              <p id={`${mediaIdId}-hint`} role="alert" className="text-xs text-destructive">
                {localeErrors.mediaId}
              </p>
            ) : (
              <p id={`${mediaIdId}-hint`} className="text-xs text-muted-foreground">
                Identifies this creative in analytics. Give a new asset a new ID.
              </p>
            )}
          </div>
        </div>

        <BenefitsEditor
          locale={locale}
          row={row}
          errors={localeErrors}
          disabled={disabled}
          onPatch={onPatch}
        />
      </div>
    </details>
  );
}

/**
 * One language's benefit list.
 *
 * REPLACES the paywall's list rather than patching it, so the order here IS the
 * render order and an empty list means "keep the paywall's own eight" — which is
 * why there is no "clear" that sends `[]` (the API rejects it).
 *
 * The choices come from the LIVE paywall (`usePaywallBenefitChoices`), never a
 * list hardcoded here: `benefitId` is what the app reports impressions under and
 * `icon` is a key of artwork BUNDLED in the APK, so a value we invented would
 * either mis-attribute analytics or render a blank tile. If that query fails the
 * two dropdowns degrade to text inputs — an editor who knows the id can still
 * work, and validation still mirrors the server's shape rules.
 */
function BenefitsEditor({
  locale,
  row,
  errors,
  disabled,
  onPatch,
}: {
  locale: string;
  row: LocaleDraft;
  errors: LocaleErrors;
  disabled: boolean;
  onPatch: (next: LocaleDraft) => void;
}) {
  const { data: choices, isPending } = usePaywallBenefitChoices(locale);
  const options = choices ?? [];
  const benefits = row.benefits;

  function setBenefits(next: BenefitDraft[]) {
    onPatch({ ...row, benefits: next });
  }

  function patchBenefit(index: number, values: Partial<BenefitDraft>) {
    setBenefits(benefits.map((item, i) => (i === index ? { ...item, ...values } : item)));
  }

  function move(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= benefits.length) return;
    const next = [...benefits];
    const [moved] = next.splice(index, 1);
    if (moved) next.splice(target, 0, moved);
    setBenefits(next);
  }

  /**
   * Prefilled from the paywall's own row — its icon and its name IN THIS
   * LANGUAGE — so "pick + reorder" is one click and renaming is optional. The
   * first benefit not already listed, since adding the same one twice is a 400.
   */
  function add() {
    const used = new Set(benefits.map((item) => item.benefitId));
    const choice = options.find((item) => !used.has(item.benefitId));
    setBenefits([
      ...benefits,
      choice
        ? { benefitId: choice.benefitId, icon: choice.icon, name: choice.localizedName }
        : { benefitId: '', icon: '', name: '' },
    ]);
  }

  return (
    <fieldset className="grid gap-3 rounded-md border p-4">
      <legend className="px-1 text-sm font-medium">Benefits</legend>
      <p className="text-xs text-muted-foreground">
        Optional. Leave this empty to keep the paywall’s own benefits. Adding any
        replaces the whole list for this language — shown top first, so the order
        here is the order on screen.
      </p>

      {errors.benefits && (
        <p role="alert" className="text-xs text-destructive">
          {errors.benefits}
        </p>
      )}

      {benefits.map((benefit, index) => (
        <BenefitRow
          key={index}
          locale={locale}
          benefit={benefit}
          index={index}
          total={benefits.length}
          options={options}
          used={benefits.map((item) => item.benefitId)}
          errors={errors.rows[index] ?? {}}
          disabled={disabled}
          onPatch={(values) => patchBenefit(index, values)}
          onMove={(delta) => move(index, delta)}
          onRemove={() => setBenefits(benefits.filter((_, i) => i !== index))}
        />
      ))}

      {/* No "add" until the paywall's own benefits have been fetched (or have
          failed): a row added before then would prefill blank, and the editor
          would have to retype an id and an icon key that were about to arrive. */}
      {isPending ? (
        <p className="text-xs text-muted-foreground">Loading the paywall’s benefits…</p>
      ) : benefits.length < MAX_OVERRIDE_BENEFITS ? (
        <div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled}
            aria-label={`Add a benefit to ${localeLabel(locale)}`}
            onClick={add}
          >
            Add benefit
          </Button>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          At most {MAX_OVERRIDE_BENEFITS} benefits — the tile grid holds no more.
        </p>
      )}
    </fieldset>
  );
}

function BenefitRow({
  locale,
  benefit,
  index,
  total,
  options,
  used,
  errors,
  disabled,
  onPatch,
  onMove,
  onRemove,
}: {
  locale: string;
  benefit: BenefitDraft;
  index: number;
  total: number;
  options: PaywallBenefitChoice[];
  used: string[];
  errors: { benefitId?: string; icon?: string; name?: string };
  disabled: boolean;
  onPatch: (values: Partial<BenefitDraft>) => void;
  onMove: (delta: number) => void;
  onRemove: () => void;
}) {
  const base = `utm-benefit-${locale}-${index}`;
  const idId = `${base}-id`;
  const iconId = `${base}-icon`;
  const nameId = `${base}-name`;

  const known = options.some((item) => item.benefitId === benefit.benefitId);
  const icons = [...new Set(options.map((item) => item.icon))];
  const label = `${localeLabel(locale)} benefit ${index + 1}`;

  return (
    <div className="grid gap-3 rounded-md border p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">Benefit {index + 1}</span>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled || index === 0}
            aria-label={`Move ${label} up`}
            onClick={() => onMove(-1)}
          >
            Up
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled || index === total - 1}
            aria-label={`Move ${label} down`}
            onClick={() => onMove(1)}
          >
            Down
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled}
            aria-label={`Remove ${label}`}
            onClick={onRemove}
          >
            Remove
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor={idId}>Benefit</Label>
          {options.length > 0 ? (
            <Select
              id={idId}
              value={benefit.benefitId}
              disabled={disabled}
              aria-invalid={errors.benefitId !== undefined || undefined}
              aria-describedby={errors.benefitId ? `${idId}-error` : undefined}
              // Picking a benefit re-prefills its icon and its name in this
              // language: choosing a different tile means its own defaults, and
              // the editor renames afterwards if the campaign wants other words.
              onChange={(e) => {
                const choice = options.find((item) => item.benefitId === e.target.value);
                onPatch(
                  choice
                    ? {
                        benefitId: choice.benefitId,
                        icon: choice.icon,
                        name: choice.localizedName,
                      }
                    : { benefitId: e.target.value },
                );
              }}
            >
              {!known && <option value={benefit.benefitId}>{benefit.benefitId || '—'}</option>}
              {options.map((item) => (
                <option
                  key={item.benefitId}
                  value={item.benefitId}
                  // Already in this language's list — a duplicate is a 400.
                  disabled={item.benefitId !== benefit.benefitId && used.includes(item.benefitId)}
                >
                  {item.localizedName} ({item.benefitId})
                </option>
              ))}
            </Select>
          ) : (
            <Input
              id={idId}
              value={benefit.benefitId}
              disabled={disabled}
              placeholder="aarti_bhajans"
              aria-invalid={errors.benefitId !== undefined || undefined}
              aria-describedby={errors.benefitId ? `${idId}-error` : undefined}
              onChange={(e) => onPatch({ benefitId: e.target.value })}
            />
          )}
          {errors.benefitId && (
            <p id={`${idId}-error`} role="alert" className="text-xs text-destructive">
              {errors.benefitId}
            </p>
          )}
        </div>

        <div className="grid gap-2">
          <Label htmlFor={iconId}>Icon</Label>
          {icons.length > 0 ? (
            <Select
              id={iconId}
              value={benefit.icon}
              disabled={disabled}
              aria-invalid={errors.icon !== undefined || undefined}
              aria-describedby={errors.icon ? `${iconId}-error` : `${iconId}-hint`}
              onChange={(e) => onPatch({ icon: e.target.value })}
            >
              {!icons.includes(benefit.icon) && (
                <option value={benefit.icon}>{benefit.icon || '—'}</option>
              )}
              {icons.map((icon) => (
                <option key={icon} value={icon}>
                  {icon}
                </option>
              ))}
            </Select>
          ) : (
            <Input
              id={iconId}
              value={benefit.icon}
              disabled={disabled}
              placeholder="benefit-mandir.png"
              aria-invalid={errors.icon !== undefined || undefined}
              aria-describedby={errors.icon ? `${iconId}-error` : `${iconId}-hint`}
              onChange={(e) => onPatch({ icon: e.target.value })}
            />
          )}
          {errors.icon ? (
            <p id={`${iconId}-error`} role="alert" className="text-xs text-destructive">
              {errors.icon}
            </p>
          ) : (
            <p id={`${iconId}-hint`} className="text-xs text-muted-foreground">
              Artwork bundled in the app — nothing to upload. A key the installed
              build does not ship draws a blank tile.
            </p>
          )}
        </div>
      </div>

      <div className="grid gap-2">
        <Label htmlFor={nameId}>Name</Label>
        <Input
          id={nameId}
          value={benefit.name}
          maxLength={60}
          disabled={disabled}
          placeholder="Mandir"
          aria-invalid={errors.name !== undefined || undefined}
          aria-describedby={errors.name ? `${nameId}-error` : `${nameId}-hint`}
          onChange={(e) => onPatch({ name: e.target.value })}
        />
        {errors.name ? (
          <p id={`${nameId}-error`} role="alert" className="text-xs text-destructive">
            {errors.name}
          </p>
        ) : (
          <p id={`${nameId}-hint`} className="text-xs text-muted-foreground">
            What this tile is called in this campaign, in this language.
          </p>
        )}
      </div>
    </div>
  );
}

function DeleteOverrideDialog({
  row,
  onClose,
}: {
  row: UtmOverride | null;
  onClose: () => void;
}) {
  const remove = useDeleteUtmOverride();
  const [busy, setBusy] = React.useState(false);

  async function confirm() {
    if (!row) return;
    setBusy(true);
    try {
      await remove.mutateAsync(row.id);
      notify.success('Ad group override deleted');
      onClose();
    } catch (error) {
      if (error instanceof ApiError && error.isNotFound) {
        notify.info('That override was already deleted.');
        onClose();
      } else {
        notify.error(error, 'Could not delete this override.');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={row !== null} onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete this ad group override?</DialogTitle>
          <DialogDescription asChild>
            <div className="grid gap-2 text-left">
              <p className="font-medium">{row?.utmGroup ?? ''}</p>
              <p>
                This <span className="font-medium">permanently removes</span> the
                row and cannot be undone. Users from this ad group go back to the
                phone-number A/B split within about 5 minutes. To pause it
                instead, switch the override off and keep the row.
              </p>
            </div>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={busy}
            onClick={() => void confirm()}
          >
            {busy ? 'Deleting…' : 'Delete permanently'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** `<MediaUploadField>` types its value as `unknown`; it only ever emits a URL string. */
function asUrl(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}
