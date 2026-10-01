import * as React from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { EntityForm, type EntityFormField } from '@/components/entity-form/entity-form';
import { translationsField, translationsChanged } from '@/components/translations';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiError, errorMessage } from '@/lib/api-error';
import { adminKeys } from '@/lib/query-keys';

import {
  useCreateWallpaperRow,
  useUpdateWallpaperRow,
  useWallpaperRow,
  type WallpaperRowCreateBody,
  type WallpaperRowDetail,
  type WallpaperRowPatchBody,
} from './use-wallpaper-rows';
import { useDeityOptions } from './use-deity-options';
import {
  ICON_KEY_OPTIONS,
  ROW_TYPE_OPTIONS,
  RowFormSchema,
  type RowFormValues,
} from './row-schema';
import { RowItemsEditor } from './row-items-editor';

/**
 * The homepage-row create/edit form (TAM-97 §(e)). `rowType` and `rowKey` are
 * create-only. `iconKey` is a `<select>` of bundled-asset KEYS — never an upload,
 * never free text (§#EXPORT_CRITICAL). The curated-items editor is shown ONLY
 * for `custom` rows; the other four get an explanation, and `liked` is called out
 * as personalised.
 */

export type RowFormState = { kind: 'create' } | { kind: 'edit'; id: string } | null;

export function RowFormDialog({
  state,
  onClose,
}: {
  state: RowFormState;
  onClose: () => void;
}) {
  return (
    <Dialog open={state !== null} onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        {state?.kind === 'edit' ? (
          <EditRow id={state.id} onClose={onClose} />
        ) : (
          <CreateRow onClose={onClose} />
        )}
      </DialogContent>
    </Dialog>
  );
}

const EMPTY: RowFormValues = {
  rowKey: '',
  title: '',
  rowType: 'custom',
  iconKey: '',
  mediaTypeFilter: '',
  deityTagFilter: '',
  maxItems: 20,
  displayOrder: 0,
  isActive: true,
  translations: [],
};

/** The per-locale row-title editor (TAM-111). */
const TRANSLATIONS_FIELD: EntityFormField<RowFormValues> = {
  name: 'translations',
  label: 'Title translations',
  type: 'custom',
  render: translationsField({
    fields: [{ name: 'title', label: 'Title', required: true, maxLength: 200 }],
    title: 'Title translations',
  }),
};

function useRowFields(
  mode: 'create' | 'edit',
): EntityFormField<RowFormValues>[] {
  const { data: deityOptions } = useDeityOptions();

  const fields: EntityFormField<RowFormValues>[] = [
    {
      name: 'rowKey',
      label: 'Row key',
      type: 'text',
      required: mode === 'create',
      disabled: mode === 'edit',
      placeholder: 'top-live',
      description:
        mode === 'edit'
          ? 'Row key is a permanent config key and cannot be changed.'
          : 'Lowercase letters, numbers and single hyphens. Permanent.',
    },
    { name: 'title', label: 'Title', type: 'text', required: true },
    {
      name: 'rowType',
      label: 'Row type',
      type: 'select',
      required: mode === 'create',
      disabled: mode === 'edit',
      options: ROW_TYPE_OPTIONS,
      description:
        mode === 'edit'
          ? 'Row type cannot be changed — it decides how the row resolves. Create a new row to switch.'
          : 'Only “Custom” rows accept hand-curated items; the others resolve automatically.',
    },
    {
      name: 'iconKey',
      label: 'Icon',
      type: 'select',
      options: [{ label: 'None', value: '' }, ...ICON_KEY_OPTIONS],
      description: 'A bundled-app icon key — not an upload.',
    },
    {
      name: 'mediaTypeFilter',
      label: 'Media-type filter',
      type: 'select',
      options: [
        { label: 'Any', value: '' },
        { label: 'Static', value: 'static' },
        { label: 'Live', value: 'live' },
      ],
    },
    {
      name: 'deityTagFilter',
      label: 'Deity filter',
      type: 'select',
      options: [
        { label: 'Any', value: '' },
        ...(deityOptions ?? []).map((d) => ({ label: d.slug, value: d.slug })),
      ],
    },
    { name: 'maxItems', label: 'Max items', type: 'number' },
    { name: 'displayOrder', label: 'Display order', type: 'number' },
    { name: 'isActive', label: 'Active', type: 'switch' },
    TRANSLATIONS_FIELD,
  ];

  return fields;
}

function CreateRow({ onClose }: { onClose: () => void }) {
  const create = useCreateWallpaperRow();
  const fields = useRowFields('create');

  return (
    <>
      <DialogHeader>
        <DialogTitle>New homepage row</DialogTitle>
        <DialogDescription>
          The row type and key are permanent. For a “Custom” row, save it first,
          then curate its wallpapers from the edit view.
        </DialogDescription>
      </DialogHeader>

      <EntityForm<RowFormValues>
        mode="create"
        entityLabel="Homepage row"
        schema={RowFormSchema}
        defaultValues={EMPTY}
        fields={fields}
        onSubmit={(values) => create.mutateAsync(toCreateBody(values)).catch(rethrowConflict)}
        onSuccess={onClose}
        onCancel={onClose}
      />
    </>
  );
}

function EditRow({ id, onClose }: { id: string; onClose: () => void }) {
  const { data: row, isLoading, isError, error } = useWallpaperRow(id);

  if (isLoading) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>Edit homepage row</DialogTitle>
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

  if (isError || !row) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>Edit homepage row</DialogTitle>
        </DialogHeader>
        <Alert variant="destructive">
          <AlertTitle>Could not load this row</AlertTitle>
          <AlertDescription>{errorMessage(error, 'Please try again.')}</AlertDescription>
        </Alert>
      </>
    );
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Edit “{row.title}”</DialogTitle>
        <DialogDescription>
          Update the row’s filters and ordering. Curated items appear below for
          custom rows only.
        </DialogDescription>
      </DialogHeader>

      <EditRowForm key={row.updatedAt} row={row} onClose={onClose} />

      <div className="border-t pt-4">
        <RowItemsSection row={row} />
      </div>
    </>
  );
}

function EditRowForm({ row, onClose }: { row: WallpaperRowDetail; onClose: () => void }) {
  const qc = useQueryClient();
  const update = useUpdateWallpaperRow();
  const fields = useRowFields('edit');
  const initial = React.useMemo(() => detailToValues(row), [row]);

  return (
    <EntityForm<RowFormValues>
      mode="edit"
      entityLabel="Homepage row"
      schema={RowFormSchema}
      updatedAt={row.updatedAt}
      defaultValues={initial}
      fields={fields}
      onSubmit={(values) =>
        update.mutateAsync({
          id: row.id,
          changes: diffChanges(initial, values),
          expectedUpdatedAt: values.updatedAt as string,
        })
      }
      onSuccess={onClose}
      onConflict={() => {
        void qc.invalidateQueries({ queryKey: adminKeys.detail('wallpaper-row', row.id) });
      }}
      onCancel={onClose}
    />
  );
}

/** Curated items for `custom` rows; an explanation for the resolved kinds
 *  (§(e)/(f); TAM-96 400s an item write on a non-`custom` row). */
function RowItemsSection({ row }: { row: WallpaperRowDetail }) {
  if (row.rowType === 'custom') {
    return <RowItemsEditor row={row} />;
  }

  if (row.rowType === 'liked') {
    return (
      <Alert>
        <AlertTitle>Personalised row</AlertTitle>
        <AlertDescription>
          The “Liked” row is personalised per user from their own likes. It has no
          curatable items and cannot be previewed in admin.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Alert>
      <AlertTitle>Automatically resolved</AlertTitle>
      <AlertDescription>
        This row is resolved automatically from its filters — items cannot be
        curated. Only “Custom” rows accept hand-picked wallpapers.
      </AlertDescription>
    </Alert>
  );
}

// ── Payload builders ──────────────────────────────────────────────────────────

function toCreateBody(v: RowFormValues): WallpaperRowCreateBody {
  const body: WallpaperRowCreateBody = {
    rowKey: v.rowKey,
    title: v.title.trim(),
    rowType: v.rowType,
    maxItems: v.maxItems,
    displayOrder: v.displayOrder,
    isActive: v.isActive,
    translations: v.translations,
  };
  if (v.iconKey !== '') body.iconKey = v.iconKey;
  if (v.mediaTypeFilter !== '') body.mediaTypeFilter = v.mediaTypeFilter;
  if (v.deityTagFilter !== '') body.deityTagFilter = v.deityTagFilter;
  return body;
}

function detailToValues(d: WallpaperRowDetail): RowFormValues {
  return {
    rowKey: d.rowKey,
    title: d.title,
    rowType: d.rowType,
    iconKey: d.iconKey ?? '',
    mediaTypeFilter: d.mediaTypeFilter ?? '',
    deityTagFilter: d.deityTagFilter ?? '',
    maxItems: d.maxItems,
    displayOrder: d.displayOrder,
    isActive: d.isActive,
    translations: d.translations.map((t) => ({ locale: t.locale, title: t.title })),
  };
}

/** SEND ONLY WHAT CHANGED. `rowKey`/`rowType` are never here (immutable);
 *  cleared filters become `null`. */
function diffChanges(
  initial: RowFormValues,
  v: RowFormValues,
): Omit<WallpaperRowPatchBody, 'expectedUpdatedAt'> {
  const c: Omit<WallpaperRowPatchBody, 'expectedUpdatedAt'> = {};
  if (v.title.trim() !== initial.title) c.title = v.title.trim();
  if (v.iconKey !== initial.iconKey) c.iconKey = v.iconKey === '' ? null : v.iconKey;
  if (v.mediaTypeFilter !== initial.mediaTypeFilter)
    c.mediaTypeFilter = v.mediaTypeFilter === '' ? null : v.mediaTypeFilter;
  if (v.deityTagFilter !== initial.deityTagFilter)
    c.deityTagFilter = v.deityTagFilter === '' ? null : v.deityTagFilter;
  if (v.maxItems !== initial.maxItems) c.maxItems = v.maxItems;
  if (v.displayOrder !== initial.displayOrder) c.displayOrder = v.displayOrder;
  if (v.isActive !== initial.isActive) c.isActive = v.isActive;
  if (translationsChanged(v.translations, initial.translations)) c.translations = v.translations;
  return c;
}

function rethrowConflict(error: unknown): never {
  if (error instanceof ApiError && error.errorCode === 'SLUG_CONFLICT') {
    throw new ApiError(error.message, 422, error.errorCode);
  }
  throw error;
}
