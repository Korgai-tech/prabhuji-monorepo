import { useQueryClient } from '@tanstack/react-query';

import { EntityForm } from '@/components/entity-form/entity-form';
import { mediaField } from '@/components/media';
import { translationsField } from '@/components/translations';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ApiError, errorMessage } from '@/lib/api-error';
import { adminKeys } from '@/lib/query-keys';

import {
  useCreateDeity,
  useDeity,
  useUpdateDeity,
  type DeityDetail,
} from './use-deities';
import { DeityFormSchema, type DeityFormValues } from './deity-schema';

/**
 * ════════════════════════════════════════════════════════════════════════════
 *  The deity create/edit form — the EXEMPLAR `<EntityForm>` composition.
 * ════════════════════════════════════════════════════════════════════════════
 *
 * ── Create vs edit (one component, two modes) ─────────────────────────────────
 *  - CREATE (`mode="create"`): `slug` is editable, `iconUrl` uploads via
 *    `<MediaUploadField>`, `sortOrder`/`active` default. No translations here —
 *    a deity has no id yet, so its per-locale names are managed on the edit view
 *    (§(d)); the create body seeds an empty `translations: []`.
 *  - EDIT (`mode="edit"`): the form is REMOUNTED with `key={deity.updatedAt}`
 *    (so it rebinds to fresh data after an invalidation), `slug` is DISABLED with
 *    an explanation (it is immutable — five modules reference it with no FK, so a
 *    rename orphans every tag; §(b)), and `updatedAt` is passed as the ADR C3
 *    precondition (required at compile time by the `mode` discriminated union).
 *
 * ── updatedAt / optimistic concurrency ───────────────────────────────────────
 *  `<EntityForm mode="edit">` merges `updatedAt` into the payload; the PATCH hook
 *  forwards it as `expectedUpdatedAt`. A 409 `STALE_WRITE` is handled ONCE inside
 *  `<EntityForm>` (conflict toast + banner) and `onConflict` refetches the row.
 *
 * ── Send only what changed (§#EXPORT_CRITICAL) ───────────────────────────────
 *  On edit we diff against the loaded row and PATCH only the fields that moved.
 *  A seeded deity's `iconUrl` is a picsum URL that would FAIL TAM-84's
 *  `validateOwnedUrl`; re-sending it on an unrelated `sortOrder` edit would break
 *  that edit for a reason the editor cannot act on. So an untouched `iconUrl` is
 *  never sent. `slug` is likewise never in a PATCH (the API 400s on it).
 *
 * ── Duplicate slug on create (§(b)) ──────────────────────────────────────────
 *  A duplicate slug is a 409 `SLUG_CONFLICT` — the SAME status as a stale write,
 *  but a different failure. `<EntityForm>`'s generic 409 path would mislabel it
 *  "modified by someone else", so create's `onSubmit` re-throws it with a
 *  non-conflict status: the editor then sees the server's real message ("A deity
 *  with slug … already exists") in the form's error banner. (True inline
 *  attachment to the `slug` field needs a per-field error hook in `<EntityForm>`
 *  — a TAM-86 enhancement, not a per-module fork.)
 */

export type DeityFormState = { kind: 'create' } | { kind: 'edit'; id: string } | null;

export function DeityFormDialog({
  state,
  onClose,
}: {
  state: DeityFormState;
  onClose: () => void;
}) {
  return (
    <Dialog
      open={state !== null}
      onOpenChange={(open) => (!open ? onClose() : undefined)}
    >
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        {state?.kind === 'edit' ? (
          <EditDeity id={state.id} onClose={onClose} />
        ) : (
          <CreateDeity onClose={onClose} />
        )}
      </DialogContent>
    </Dialog>
  );
}

const ICON_FIELD = mediaField({ module: 'deity', entity: 'deity', field: 'iconUrl' });

/** Per-locale display names — the controlled `<TranslationsField>` (TAM-108). */
const TRANSLATIONS_FIELD = {
  name: 'translations' as const,
  label: 'Display names',
  type: 'custom' as const,
  render: translationsField({
    fields: [{ name: 'displayName', label: 'Display name', required: true, maxLength: 200 }],
    title: 'Display names',
    description:
      'One name per language. Absent languages fall back to the slug in the app (TAM-57).',
  }),
};

function CreateDeity({ onClose }: { onClose: () => void }) {
  const create = useCreateDeity();

  return (
    <>
      <DialogHeader>
        <DialogTitle>New deity</DialogTitle>
        <DialogDescription>
          The slug is a permanent reference key — five modules tag content against
          it. Choose it carefully; it cannot be changed later.
        </DialogDescription>
      </DialogHeader>

      <EntityForm<DeityFormValues>
        mode="create"
        entityLabel="Deity"
        schema={DeityFormSchema}
        defaultValues={{ slug: '', iconUrl: '', sortOrder: 0, active: true, translations: [] }}
        fields={[
          {
            name: 'slug',
            label: 'Slug',
            type: 'text',
            required: true,
            placeholder: 'ganesh',
            description:
              'Lowercase letters, numbers and single hyphens. Permanent — cannot be changed after creation.',
          },
          {
            name: 'iconUrl',
            label: 'Icon',
            type: 'custom',
            required: true,
            render: ICON_FIELD,
          },
          {
            name: 'sortOrder',
            label: 'Sort order',
            type: 'number',
            description: 'Lower numbers appear first in the app’s deity filter.',
          },
          { name: 'active', label: 'Active', type: 'switch' },
          TRANSLATIONS_FIELD,
        ]}
        onSubmit={(values) =>
          create
            .mutateAsync({
              slug: values.slug,
              iconUrl: values.iconUrl,
              sortOrder: values.sortOrder,
              active: values.active,
              translations: values.translations,
            })
            .catch(rethrowSlugConflict)
        }
        onSuccess={onClose}
        onCancel={onClose}
      />
    </>
  );
}

function EditDeity({ id, onClose }: { id: string; onClose: () => void }) {
  const { data: deity, isLoading, isError, error } = useDeity(id);

  if (isLoading) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>Edit deity</DialogTitle>
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

  if (isError || !deity) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>Edit deity</DialogTitle>
        </DialogHeader>
        <Alert variant="destructive">
          <AlertTitle>Could not load this deity</AlertTitle>
          <AlertDescription>{errorMessage(error, 'Please try again.')}</AlertDescription>
        </Alert>
      </>
    );
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Edit “{deity.slug}”</DialogTitle>
        <DialogDescription>
          Update the icon, ordering, status and per-language display names, then
          save.
        </DialogDescription>
      </DialogHeader>

      {/* REMOUNT on `updatedAt` so the form rebinds to fresh data after an
          invalidation — `<EntityForm>` snapshots `defaultValues` on mount. */}
      <EditDeityForm key={deity.updatedAt} deity={deity} onClose={onClose} />
    </>
  );
}

function EditDeityForm({ deity, onClose }: { deity: DeityDetail; onClose: () => void }) {
  const qc = useQueryClient();
  const update = useUpdateDeity();

  return (
    <EntityForm<DeityFormValues>
      mode="edit"
      entityLabel="Deity"
      schema={DeityFormSchema}
      updatedAt={deity.updatedAt}
      defaultValues={{
        slug: deity.slug,
        iconUrl: deity.iconUrl,
        sortOrder: deity.sortOrder,
        active: deity.active,
        translations: deity.translations.map((t) => ({
          locale: t.locale,
          displayName: t.displayName,
        })),
      }}
      fields={[
        {
          name: 'slug',
          label: 'Slug',
          type: 'text',
          disabled: true,
          description:
            'Slug is referenced by tagged content and cannot be changed.',
        },
        {
          name: 'iconUrl',
          label: 'Icon',
          type: 'custom',
          required: true,
          render: ICON_FIELD,
        },
        {
          name: 'sortOrder',
          label: 'Sort order',
          type: 'number',
          description: 'Lower numbers appear first in the app’s deity filter.',
        },
        { name: 'active', label: 'Active', type: 'switch' },
        TRANSLATIONS_FIELD,
      ]}
      // SEND ONLY WHAT CHANGED — never re-send an untouched (possibly seeded)
      // iconUrl, never send slug (§#EXPORT_CRITICAL). `translations` is sent as
      // the full set only when it changed (the server replaces the set); an
      // untouched set is omitted so it stays put. `updatedAt` is merged by
      // `<EntityForm>` and forwarded as the `expectedUpdatedAt` precondition.
      onSubmit={(values) => {
        const changes: {
          iconUrl?: string;
          sortOrder?: number;
          active?: boolean;
          translations?: DeityFormValues['translations'];
        } = {};
        if (values.iconUrl !== deity.iconUrl) changes.iconUrl = values.iconUrl;
        if (values.sortOrder !== deity.sortOrder) changes.sortOrder = values.sortOrder;
        if (values.active !== deity.active) changes.active = values.active;
        if (translationsChanged(values.translations, deity.translations)) {
          changes.translations = values.translations;
        }
        return update.mutateAsync({
          id: deity.id,
          changes,
          expectedUpdatedAt: values.updatedAt as string,
        });
      }}
      onSuccess={onClose}
      onConflict={() => {
        void qc.invalidateQueries({ queryKey: adminKeys.detail('deity', deity.id) });
      }}
      onCancel={onClose}
    />
  );
}

/**
 * Turn a create-time 409 `SLUG_CONFLICT` into a non-conflict `ApiError` so
 * `<EntityForm>` surfaces the server's real duplicate-slug message rather than
 * its generic "modified by someone else" concurrency UX (§(b)).
 */
function rethrowSlugConflict(error: unknown): never {
  if (error instanceof ApiError && error.errorCode === 'SLUG_CONFLICT') {
    throw new ApiError(error.message, 422, error.errorCode);
  }
  throw error;
}

/** True if the edited translation set differs from the loaded one (order-insensitive). */
function translationsChanged(
  next: { locale: string; displayName: string }[],
  current: { locale: string; displayName: string }[],
): boolean {
  if (next.length !== current.length) return true;
  const byLocale = new Map(current.map((t) => [t.locale, t.displayName]));
  return next.some((t) => byLocale.get(t.locale) !== t.displayName);
}
