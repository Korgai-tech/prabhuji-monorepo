import * as React from 'react';
import { z } from 'zod';
import { useQueryClient } from '@tanstack/react-query';

import { EntityForm, type EntityFormField } from '@/components/entity-form/entity-form';
import { mediaField } from '@/components/media';
import {
  translationsField,
  translationsSchema,
  translationsChanged,
} from '@/components/translations';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Select } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { errorMessage } from '@/lib/api-error';
import { adminKeys } from '@/lib/query-keys';
// TAM-175 — the deity picker's data source. Shared from the status feature the
// same way `pinned-content` reuses it: the deity list is one taxonomy, and a
// fourth copy of this hook would be a fourth thing to keep in step.
import { useDeityOptions } from '@/features/status/use-deity-options';

import {
  useCreateHomeFeedItem,
  useHomeFeedItem,
  useUpdateHomeFeedItem,
  type HomeFeedItemDetail,
  type HomeFeedItemPatchChanges,
  type HomeFeedItemTranslation,
} from './use-home-feed-items';
import {
  IMAGE_TYPES,
  AUDIO_TYPES,
  CONTENT_TYPE_OPTIONS,
  MODULE_KEY_OPTIONS,
  HOME_MODULE_KEYS,
  contentTypeHasAudio,
  type ContentType,
  type HomeModuleKey,
} from './home-constants';
import {
  DestinationSchema,
  destinationField,
  destinationFromRow,
  destinationToRequired,
  EMPTY_DESTINATION,
  type DestinationFieldValue,
} from './destination-field';
import type { DestinationType } from './home-constants';
import {
  BadgeSchema,
  badgeField,
  badgeFromRow,
  badgeToBody,
  EMPTY_BADGE,
  type BadgeFieldValue,
} from './badge-field';

/**
 * ════════════════════════════════════════════════════════════════════════════
 *  Feed item create/edit form (TAM-105 §(d)).
 * ════════════════════════════════════════════════════════════════════════════
 *
 *  - `slug` is create-only. `contentType` DRIVES whether `audioPreviewUrl` is
 *    shown (only `aarti | mantra | ringtone` — TAM-104 AC (e)); it lives OUTSIDE
 *    `<EntityForm>` as its own select so the field list can react to it without
 *    remounting (no lost edits — the audio row simply appears/disappears).
 *  - The `badge` / `badgeLabel` PAIRED invariant is a single `<BadgeField>`:
 *    picking a badge reveals a required label; clearing the badge clears the
 *    label — the broken pairing TAM-104 400s is structurally hard to reach.
 *  - The CTA destination is the shared `<DestinationField>` (keys, never URLs).
 *  - `module` / `headerDestinationModule` are module-key selects.
 *  - `shareDeepLink` is the ONE legitimately URL-shaped field (TAM-104 Evidence)
 *    → a `url` input. `trendingScore` is CMS-curated and EDITABLE (TAM-104
 *    Evidence — never server-computed).
 */

type TrendingScore = number | '';

interface FeedItemFormValues extends Record<string, unknown> {
  slug: string;
  title: string;
  subtitle: string;
  label: string;
  badge: BadgeFieldValue;
  heroImageUrl: string;
  audioPreviewUrl: string;
  module: string;
  /** TAM-175 — deity slug, or '' for "no god". Picked from a list, never typed. */
  deitySlug: string;
  ctaLabel: string;
  cta: DestinationFieldValue;
  headerDestinationModule: string;
  shareTitle: string;
  shareText: string;
  shareDeepLink: string;
  shareThumbnailUrl: string;
  trendingScore: TrendingScore;
  isActive: boolean;
  translations: HomeFeedItemTranslation[];
}

const moduleKeySchema = z
  .string()
  .refine((v) => (HOME_MODULE_KEYS as readonly string[]).includes(v), 'Choose a module');

const FeedItemSchema: z.ZodType<FeedItemFormValues> = z.object({
  slug: z.string().min(1, 'Slug is required'),
  title: z.string().min(1, 'Title is required'),
  subtitle: z.string(),
  label: z.string(),
  badge: BadgeSchema,
  heroImageUrl: z.string().url('Upload a hero image to continue'),
  audioPreviewUrl: z.string(),
  module: moduleKeySchema,
  // Free-form on purpose: '' is a legitimate value ("no god"), and the option
  // list is CMS data, so a closed enum here would need a deploy per new deity.
  deitySlug: z.string(),
  ctaLabel: z.string().min(1, 'CTA label is required'),
  cta: DestinationSchema,
  headerDestinationModule: moduleKeySchema,
  shareTitle: z.string().min(1, 'Share title is required'),
  shareText: z.string().min(1, 'Share text is required'),
  shareDeepLink: z.string().url('A share deep link must be a valid URL'),
  shareThumbnailUrl: z.string(),
  trendingScore: z.union([z.number().int('Whole numbers only'), z.literal('')]),
  isActive: z.boolean(),
  translations: translationsSchema({
    title: z.string().trim().min(1, 'Title is required').max(200),
    subtitle: z.string().trim().max(500),
    label: z.string().trim().max(200),
    ctaLabel: z.string().trim().min(1, 'CTA label is required').max(120),
    badgeLabel: z.string().trim().max(120),
  }),
});

/** Map a loaded feed item's translations into the form value shape. */
function feedItemTranslations(i: HomeFeedItemDetail): HomeFeedItemTranslation[] {
  return i.translations.map((t) => ({
    locale: t.locale,
    title: t.title,
    subtitle: t.subtitle ?? '',
    label: t.label ?? '',
    ctaLabel: t.ctaLabel,
    badgeLabel: t.badgeLabel ?? '',
  }));
}

const HERO_FIELD = mediaField({
  module: 'home',
  entity: 'homeFeedItem',
  field: 'heroImageUrl',
  accept: IMAGE_TYPES,
});
const AUDIO_FIELD = mediaField({
  module: 'home',
  entity: 'homeFeedItem',
  field: 'audioPreviewUrl',
  accept: AUDIO_TYPES,
});
const SHARE_THUMB_FIELD = mediaField({
  module: 'home',
  entity: 'homeFeedItem',
  field: 'shareThumbnailUrl',
  accept: IMAGE_TYPES,
});

/**
 * The fields shared by create + edit. `slug` is added by the caller (editable on
 * create, disabled on edit); the audio field is included only for audio content
 * types.
 */
function feedFields(
  contentType: ContentType,
  deityOptions: { value: string; label: string }[]
): EntityFormField<FeedItemFormValues>[] {
  const fields: EntityFormField<FeedItemFormValues>[] = [
    { name: 'title', label: 'Title', type: 'text', required: true },
    { name: 'subtitle', label: 'Subtitle', type: 'text' },
    { name: 'label', label: 'Label', type: 'text' },
    {
      name: 'badge',
      label: 'Badge',
      type: 'custom',
      render: badgeField(),
    },
    {
      name: 'heroImageUrl',
      label: 'Hero image',
      type: 'custom',
      required: true,
      render: HERO_FIELD,
    },
  ];

  if (contentTypeHasAudio(contentType)) {
    fields.push({
      name: 'audioPreviewUrl',
      label: 'Audio preview',
      type: 'custom',
      description: 'A short MP3 preview. Only for aarti, mantra and ringtone content.',
      render: AUDIO_FIELD,
    });
  }

  fields.push(
    {
      name: 'module',
      label: 'Module',
      type: 'select',
      required: true,
      options: MODULE_KEY_OPTIONS,
      description: 'The routing/engagement module key.',
    },
    {
      name: 'deitySlug',
      label: 'Deity',
      type: 'select',
      placeholder: '— No deity —',
      options: deityOptions,
      description:
        'Which god this card belongs to. Left empty, the card only ever appears in an "any god" slot.',
    },
    { name: 'ctaLabel', label: 'CTA label', type: 'text', required: true },
    {
      name: 'cta',
      label: 'CTA destination',
      type: 'custom',
      description: 'Where the CTA sends the user. Keys, never URLs.',
      render: destinationField(),
    },
    {
      name: 'headerDestinationModule',
      label: 'Header destination module',
      type: 'select',
      required: true,
      options: MODULE_KEY_OPTIONS,
    },
    { name: 'shareTitle', label: 'Share title', type: 'text', required: true },
    { name: 'shareText', label: 'Share text', type: 'textarea', required: true },
    {
      name: 'shareDeepLink',
      label: 'Share deep link',
      type: 'url',
      required: true,
      placeholder: 'https://…',
      description: 'The externally-shared link — the one destination field that is a real URL.',
    },
    {
      name: 'shareThumbnailUrl',
      label: 'Share thumbnail',
      type: 'custom',
      render: SHARE_THUMB_FIELD,
    },
    {
      name: 'trendingScore',
      label: 'Trending score',
      type: 'number',
      description: 'Curated rank used when the feed is trending-first. Leave blank for none.',
    },
    { name: 'isActive', label: 'Active', type: 'switch' },
    {
      name: 'translations',
      label: 'Translations',
      type: 'custom',
      render: translationsField({
        fields: [
          { name: 'title', label: 'Title', required: true, maxLength: 200 },
          { name: 'subtitle', label: 'Subtitle', maxLength: 500 },
          { name: 'label', label: 'Label', maxLength: 200 },
          { name: 'ctaLabel', label: 'CTA label', required: true, maxLength: 120 },
          { name: 'badgeLabel', label: 'Badge label', maxLength: 120 },
        ],
        title: 'Translations',
      }),
    },
  );
  return fields;
}

function emptyToNull(value: string): string | null {
  return value.trim() === '' ? null : value;
}

/**
 * A feed-card draft derived from module content ("Add to feed" — see
 * `add-to-feed.ts`). Every field is optional and merely overrides a create
 * default; the editor still sees, and can change, all of it before saving.
 *
 * `heroImageUrl` MAY be the source content's own image: the feed accepts a reused
 * media URL (api reusable-media path), so a wallpaper thumbnail becomes the hero
 * with no duplicate upload. Omitted ⇒ the editor picks one.
 */
export type FeedItemPrefill = Partial<{
  slug: string;
  title: string;
  heroImageUrl: string;
  contentType: ContentType;
  module: HomeModuleKey;
  headerDestinationModule: HomeModuleKey;
  ctaLabel: string;
  ctaDestinationType: DestinationType;
  ctaDestinationValue: string;
  shareTitle: string;
  shareText: string;
  shareDeepLink: string;
}>;

export type FeedItemFormState =
  | { kind: 'create'; prefill?: FeedItemPrefill }
  | { kind: 'edit'; id: string }
  | null;

export function FeedItemFormDialog({
  state,
  onClose,
}: {
  state: FeedItemFormState;
  onClose: () => void;
}) {
  return (
    <Dialog open={state !== null} onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        {state?.kind === 'edit' ? (
          <EditFeedItem id={state.id} onClose={onClose} />
        ) : (
          <CreateFeedItem onClose={onClose} prefill={state?.prefill} />
        )}
      </DialogContent>
    </Dialog>
  );
}

/** The `contentType` select owned outside `<EntityForm>` (drives the audio field). */
function ContentTypeSelect({
  value,
  onChange,
}: {
  value: ContentType;
  onChange: (value: ContentType) => void;
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor="feed-content-type">Content type</Label>
      <Select
        id="feed-content-type"
        value={value}
        onChange={(event) => onChange(event.target.value as ContentType)}
      >
        {CONTENT_TYPE_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>
      <p className="text-xs text-muted-foreground">
        Audio preview is only offered for aarti, mantra and ringtone content.
      </p>
    </div>
  );
}

function CreateFeedItem({
  onClose,
  prefill,
}: {
  onClose: () => void;
  prefill?: FeedItemPrefill;
}) {
  const create = useCreateHomeFeedItem();
  // TAM-175 — deactivated deities are included by the hook, so a card already
  // tagged with one stays editable rather than silently losing its tag on save.
  const deities = useDeityOptions();
  const deityOptions = (deities.data ?? []).map((d) => ({
    value: d.slug,
    // Mark a deactivated deity rather than hiding it — the row it is tagged on
    // must stay editable, and an unexplained missing option reads as a bug.
    label: d.active ? d.slug : `${d.slug} (inactive)`,
  }));

  // A prefill from "Add to feed" names the content's type; it drives the audio
  // field, so honour it as the initial value rather than defaulting to wallpaper.
  const [contentType, setContentType] = React.useState<ContentType>(
    prefill?.contentType ?? 'wallpaper',
  );

  return (
    <>
      <DialogHeader>
        <DialogTitle>{prefill ? 'Add to feed' : 'New feed item'}</DialogTitle>
        <DialogDescription>
          {prefill
            ? 'Prefilled from the content — review the copy, then pick a card hero image. The slug is a permanent stable reference.'
            : 'The slug is a permanent stable reference — choose it carefully.'}
        </DialogDescription>
      </DialogHeader>

      <ContentTypeSelect value={contentType} onChange={setContentType} />

      <EntityForm<FeedItemFormValues>
        mode="create"
        entityLabel="Feed item"
        schema={FeedItemSchema}
        defaultValues={{
          slug: '',
          title: '',
          subtitle: '',
          label: '',
          badge: EMPTY_BADGE,
          heroImageUrl: '',
          audioPreviewUrl: '',
          module: '',
          ctaLabel: '',
          cta: EMPTY_DESTINATION,
          headerDestinationModule: '',
          shareTitle: '',
          shareText: '',
          shareDeepLink: '',
          shareThumbnailUrl: '',
          trendingScore: '',
          deitySlug: '',
          isActive: true,
          translations: [],
          ...(prefill
            ? {
                slug: prefill.slug ?? '',
                title: prefill.title ?? '',
                // The content's own image, reused as the hero (no re-upload). The
                // MediaUploadField renders it as a preview with a Replace option.
                heroImageUrl: prefill.heroImageUrl ?? '',
                module: prefill.module ?? '',
                headerDestinationModule: prefill.headerDestinationModule ?? '',
                ctaLabel: prefill.ctaLabel ?? '',
                cta:
                  prefill.ctaDestinationType && prefill.ctaDestinationValue
                    ? {
                        type: prefill.ctaDestinationType,
                        value: prefill.ctaDestinationValue,
                        isProFeatureDiscovery: false,
                      }
                    : EMPTY_DESTINATION,
                shareTitle: prefill.shareTitle ?? '',
                shareText: prefill.shareText ?? '',
                shareDeepLink: prefill.shareDeepLink ?? '',
              }
            : {}),
        }}
        fields={[
          {
            name: 'slug',
            label: 'Slug',
            type: 'text',
            required: true,
            placeholder: 'featured-ganesh-aarti',
            description: 'Permanent — cannot be changed after creation.',
          },
          ...feedFields(contentType, deityOptions),
        ]}
        onSubmit={(values) => {
          const cta = destinationToRequired(values.cta);
          return create.mutateAsync({
            slug: values.slug,
            contentType,
            module: values.module as HomeModuleKey,
            deitySlug: emptyToNull(values.deitySlug),
            title: values.title,
            subtitle: emptyToNull(values.subtitle),
            label: emptyToNull(values.label),
            ...badgeToBody(values.badge),
            heroImageUrl: values.heroImageUrl,
            audioPreviewUrl: contentTypeHasAudio(contentType)
              ? emptyToNull(values.audioPreviewUrl)
              : null,
            ctaLabel: values.ctaLabel,
            ctaDestinationType: cta.type,
            ctaDestinationValue: cta.value,
            headerDestinationModule: values.headerDestinationModule as HomeModuleKey,
            shareTitle: values.shareTitle,
            shareText: values.shareText,
            shareDeepLink: values.shareDeepLink,
            shareThumbnailUrl: emptyToNull(values.shareThumbnailUrl),
            trendingScore: values.trendingScore === '' ? null : values.trendingScore,
            isActive: values.isActive,
            translations: values.translations,
          });
        }}
        onSuccess={onClose}
        onCancel={onClose}
      />
    </>
  );
}

function EditFeedItem({ id, onClose }: { id: string; onClose: () => void }) {
  const { data: item, isLoading, isError, error } = useHomeFeedItem(id);

  if (isLoading) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>Edit feed item</DialogTitle>
          <DialogDescription>Loading…</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      </>
    );
  }

  if (isError || !item) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>Edit feed item</DialogTitle>
        </DialogHeader>
        <Alert variant="destructive">
          <AlertTitle>Could not load this feed item</AlertTitle>
          <AlertDescription>{errorMessage(error, 'Please try again.')}</AlertDescription>
        </Alert>
      </>
    );
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Edit “{item.slug}”</DialogTitle>
        <DialogDescription>The slug is fixed. Update the feed item’s content.</DialogDescription>
      </DialogHeader>
      {/* REMOUNT on `updatedAt` so the form rebinds to fresh data after an invalidation. */}
      <EditFeedItemForm key={item.updatedAt} item={item} onClose={onClose} />
    </>
  );
}

function EditFeedItemForm({ item, onClose }: { item: HomeFeedItemDetail; onClose: () => void }) {
  const qc = useQueryClient();
  const update = useUpdateHomeFeedItem();
  // TAM-175 — deactivated deities are included by the hook, so a card already
  // tagged with one stays editable rather than silently losing its tag on save.
  const deities = useDeityOptions();
  const deityOptions = (deities.data ?? []).map((d) => ({
    value: d.slug,
    // Mark a deactivated deity rather than hiding it — the row it is tagged on
    // must stay editable, and an unexplained missing option reads as a bug.
    label: d.active ? d.slug : `${d.slug} (inactive)`,
  }));

  const [contentType, setContentType] = React.useState<ContentType>(item.contentType);

  return (
    <>
      <ContentTypeSelect value={contentType} onChange={setContentType} />

      <EntityForm<FeedItemFormValues>
        mode="edit"
        entityLabel="Feed item"
        schema={FeedItemSchema}
        updatedAt={item.updatedAt}
        defaultValues={{
          slug: item.slug,
          title: item.title,
          subtitle: item.subtitle ?? '',
          label: item.label ?? '',
          badge: badgeFromRow(item.badge, item.badgeLabel),
          heroImageUrl: item.heroImageUrl,
          audioPreviewUrl: item.audioPreviewUrl ?? '',
          module: item.module,
          deitySlug: item.deitySlug ?? '',
          ctaLabel: item.ctaLabel,
          cta: destinationFromRow({
            type: item.ctaDestinationType,
            value: item.ctaDestinationValue,
          }),
          headerDestinationModule: item.headerDestinationModule,
          shareTitle: item.shareTitle,
          shareText: item.shareText,
          shareDeepLink: item.shareDeepLink,
          shareThumbnailUrl: item.shareThumbnailUrl ?? '',
          trendingScore: item.trendingScore ?? '',
          isActive: item.isActive,
          translations: feedItemTranslations(item),
        }}
        fields={[
          {
            name: 'slug',
            label: 'Slug',
            type: 'text',
            disabled: true,
            description: 'The slug is a permanent reference and cannot be changed.',
          },
          ...feedFields(contentType, deityOptions),
        ]}
        onSubmit={(values) => {
          const changes: HomeFeedItemPatchChanges = {};
          if (translationsChanged(values.translations, feedItemTranslations(item)))
            changes.translations = values.translations;
          if (contentType !== item.contentType) changes.contentType = contentType;
          if (values.module !== item.module) changes.module = values.module as HomeModuleKey;
          const nextDeity = emptyToNull(values.deitySlug);
          if (nextDeity !== item.deitySlug) changes.deitySlug = nextDeity;
          if (values.title !== item.title) changes.title = values.title;
          const nextSubtitle = emptyToNull(values.subtitle);
          if (nextSubtitle !== item.subtitle) changes.subtitle = nextSubtitle;
          const nextLabel = emptyToNull(values.label);
          if (nextLabel !== item.label) changes.label = nextLabel;

          const badge = badgeToBody(values.badge);
          if (badge.badge !== item.badge) changes.badge = badge.badge;
          if (badge.badgeLabel !== item.badgeLabel) changes.badgeLabel = badge.badgeLabel;

          if (values.heroImageUrl !== item.heroImageUrl) {
            changes.heroImageUrl = values.heroImageUrl;
          }
          const nextAudio = contentTypeHasAudio(contentType)
            ? emptyToNull(values.audioPreviewUrl)
            : null;
          if (nextAudio !== item.audioPreviewUrl) changes.audioPreviewUrl = nextAudio;

          if (values.ctaLabel !== item.ctaLabel) changes.ctaLabel = values.ctaLabel;
          const cta = destinationToRequired(values.cta);
          if (cta.type !== item.ctaDestinationType) changes.ctaDestinationType = cta.type;
          if (cta.value !== item.ctaDestinationValue) changes.ctaDestinationValue = cta.value;
          if (values.headerDestinationModule !== item.headerDestinationModule) {
            changes.headerDestinationModule = values.headerDestinationModule as HomeModuleKey;
          }

          if (values.shareTitle !== item.shareTitle) changes.shareTitle = values.shareTitle;
          if (values.shareText !== item.shareText) changes.shareText = values.shareText;
          if (values.shareDeepLink !== item.shareDeepLink) {
            changes.shareDeepLink = values.shareDeepLink;
          }
          const nextShareThumb = emptyToNull(values.shareThumbnailUrl);
          if (nextShareThumb !== item.shareThumbnailUrl) {
            changes.shareThumbnailUrl = nextShareThumb;
          }
          const nextTrending = values.trendingScore === '' ? null : values.trendingScore;
          if (nextTrending !== item.trendingScore) changes.trendingScore = nextTrending;
          if (values.isActive !== item.isActive) changes.isActive = values.isActive;

          return update.mutateAsync({
            id: item.id,
            changes,
            expectedUpdatedAt: values.updatedAt as string,
          });
        }}
        onSuccess={onClose}
        onConflict={() => {
          void qc.invalidateQueries({ queryKey: adminKeys.detail('home-feed-item', item.id) });
        }}
        onCancel={onClose}
      />
    </>
  );
}
