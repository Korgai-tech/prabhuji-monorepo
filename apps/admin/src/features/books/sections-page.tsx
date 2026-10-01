import * as React from 'react';
import { PencilIcon, PlusIcon, PowerIcon, PowerOffIcon } from 'lucide-react';

import { DataTable } from '@/components/data-table/data-table';
import { useDataTableState } from '@/components/data-table/use-data-table-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EntityForm } from '@/components/entity-form/entity-form';
import { translationsField, translationsChanged } from '@/components/translations';
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
import { isConflictError, notify } from '@/lib/toast';

import {
  useBookSection,
  useBookSections,
  useCreateSection,
  useUpdateSection,
  type BookSection,
  type BookSectionDetail,
  type BookSectionKey,
  type BookSectionTranslation,
  type SectionChanges,
} from './use-book-sections';
import { SECTION_KEYS, SectionFormSchema, type SectionFormValues } from './book-schema';
import { DeactivateSectionDialog } from './delete-dialogs';

/**
 * Book home-screen sections (TAM-103 §(g)). A `<DataTable>` list + a create/edit
 * form whose `key` is a select of the known set (create-only — an unknown key
 * creates a section the server cannot resolve). Sections are SOFT-deleted.
 */
export function BookSectionsPage() {
  const table = useDataTableState({ sort: 'sortOrder', order: 'asc' });
  const { data, isLoading, isFetching, isError, error, refetch } = useBookSections(
    table.state,
  );

  const [formState, setFormState] = React.useState<SectionFormState>(null);
  const [deactivating, setDeactivating] = React.useState<BookSection | null>(null);

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Book sections</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          The rows of the app’s books home screen. Each has a fixed key the client
          resolves; you control its title, order and visibility.
        </p>
      </div>

      <DataTable<BookSection>
        caption="All book sections"
        columns={[
          {
            id: 'key',
            header: 'Key',
            sortField: 'key',
            cell: (row) => <code className="text-xs">{row.key}</code>,
          },
          { id: 'title', header: 'Title', cell: (row) => row.title },
          {
            id: 'sortOrder',
            header: 'Sort order',
            sortField: 'sortOrder',
            cell: (row) => row.sortOrder,
          },
          {
            id: 'isActive',
            header: 'Status',
            sortField: 'isActive',
            cell: (row) => (
              <Badge variant={row.isActive ? 'default' : 'muted'}>
                {row.isActive ? 'Active' : 'Inactive'}
              </Badge>
            ),
          },
        ]}
        filterFields={[
          { id: 'q', label: 'Search', type: 'text', placeholder: 'Search key/title…' },
          {
            id: 'isActive',
            label: 'Status',
            type: 'select',
            options: [
              { value: 'true', label: 'Active' },
              { value: 'false', label: 'Inactive' },
            ],
          },
        ]}
        toolbar={
          <Button size="sm" onClick={() => setFormState({ kind: 'create' })}>
            <PlusIcon aria-hidden="true" />
            New section
          </Button>
        }
        rows={data?.items}
        total={data?.total}
        getRowId={(row) => row.id}
        state={table.state}
        onStateChange={table.setState}
        isLoading={isLoading}
        isFetching={isFetching}
        isError={isError}
        error={error}
        onRetry={() => void refetch()}
        emptyMessage="No sections yet."
        actions={(row) => (
          <SectionRowActions
            row={row}
            onEdit={() => setFormState({ kind: 'edit', row })}
            onDeactivate={() => setDeactivating(row)}
          />
        )}
      />

      <SectionFormDialog state={formState} onClose={() => setFormState(null)} />
      <DeactivateSectionDialog row={deactivating} onClose={() => setDeactivating(null)} />
    </div>
  );
}

function SectionRowActions({
  row,
  onEdit,
  onDeactivate,
}: {
  row: BookSection;
  onEdit: () => void;
  onDeactivate: () => void;
}) {
  const update = useUpdateSection();

  async function reactivate() {
    try {
      await update.mutateAsync({
        id: row.id,
        changes: { isActive: true },
        expectedUpdatedAt: row.updatedAt,
      });
      notify.success(`${row.title} reactivated`);
    } catch (error) {
      if (isConflictError(error)) {
        notify.conflict(
          () => undefined,
          'This section changed since you opened this list — reload and try again.',
        );
      } else {
        notify.error(error, 'Could not reactivate this section.');
      }
    }
  }

  return (
    <div className="flex justify-end gap-1">
      <Button variant="ghost" size="sm" onClick={onEdit}>
        <PencilIcon aria-hidden="true" />
        Edit
      </Button>
      {row.isActive ? (
        <Button variant="ghost" size="sm" onClick={onDeactivate}>
          <PowerOffIcon aria-hidden="true" />
          Deactivate
        </Button>
      ) : (
        <Button
          variant="ghost"
          size="sm"
          disabled={update.isPending}
          onClick={() => void reactivate()}
        >
          <PowerIcon aria-hidden="true" />
          Reactivate
        </Button>
      )}
    </div>
  );
}

// ── Form ─────────────────────────────────────────────────────────────────────

type SectionFormState = { kind: 'create' } | { kind: 'edit'; row: BookSection } | null;

function SectionFormDialog({
  state,
  onClose,
}: {
  state: SectionFormState;
  onClose: () => void;
}) {
  return (
    <Dialog open={state !== null} onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent className="max-w-xl">
        {state?.kind === 'edit' ? (
          <EditSection row={state.row} onClose={onClose} />
        ) : (
          <CreateSection onClose={onClose} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function CreateSection({ onClose }: { onClose: () => void }) {
  const create = useCreateSection();
  return (
    <>
      <DialogHeader>
        <DialogTitle>New section</DialogTitle>
        <DialogDescription>
          The key identifies the section to the app and cannot be changed later.
        </DialogDescription>
      </DialogHeader>
      <EntityForm<SectionFormValues>
        mode="create"
        entityLabel="Section"
        schema={SectionFormSchema}
        defaultValues={{ key: '', title: '', sortOrder: 0, isActive: true, translations: [] }}
        fields={[
          {
            name: 'key',
            label: 'Key',
            type: 'select',
            required: true,
            options: SECTION_KEYS.map((k) => ({ value: k.value, label: k.label })),
            description: 'Fixed set — cannot be changed after creation.',
          },
          { name: 'title', label: 'Title', type: 'text', required: true },
          { name: 'sortOrder', label: 'Sort order', type: 'number' },
          { name: 'isActive', label: 'Active', type: 'switch' },
          SECTION_TRANSLATIONS_FIELD,
        ]}
        onSubmit={(values) =>
          create
            .mutateAsync({
              key: values.key as BookSectionKey,
              title: values.title,
              sortOrder: values.sortOrder,
              isActive: values.isActive,
              translations: values.translations,
            })
            .catch(rethrowKeyConflict)
        }
        onSuccess={onClose}
        onCancel={onClose}
      />
    </>
  );
}

/** The per-locale section-title editor field (TAM-112). */
const SECTION_TRANSLATIONS_FIELD = {
  name: 'translations' as const,
  label: 'Title translations',
  type: 'custom' as const,
  render: translationsField({
    fields: [{ name: 'title', label: 'Title', required: true, maxLength: 200 }],
    title: 'Title translations',
  }),
};

/** Map a loaded section's translations into the form value shape. */
function sectionTranslations(s: BookSectionDetail): BookSectionTranslation[] {
  return s.translations.map((t) => ({ locale: t.locale, title: t.title }));
}

/** The list row carries no translations, so the edit view loads the detail. */
function EditSection({ row, onClose }: { row: BookSection; onClose: () => void }) {
  const { data: section, isLoading, isError, error } = useBookSection(row.id);

  if (isLoading) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>Edit “{row.title}”</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
        </div>
      </>
    );
  }

  if (isError || !section) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>Edit “{row.title}”</DialogTitle>
        </DialogHeader>
        <Alert variant="destructive">
          <AlertTitle>Could not load this section</AlertTitle>
          <AlertDescription>{errorMessage(error, 'Please try again.')}</AlertDescription>
        </Alert>
      </>
    );
  }

  return <EditSectionForm section={section} onClose={onClose} />;
}

function EditSectionForm({
  section,
  onClose,
}: {
  section: BookSectionDetail;
  onClose: () => void;
}) {
  const update = useUpdateSection();
  return (
    <>
      <DialogHeader>
        <DialogTitle>Edit “{section.title}”</DialogTitle>
        <DialogDescription>The key cannot be changed.</DialogDescription>
      </DialogHeader>
      <EntityForm<SectionFormValues>
        key={section.updatedAt}
        mode="edit"
        entityLabel="Section"
        schema={SectionFormSchema}
        updatedAt={section.updatedAt}
        defaultValues={{
          key: section.key,
          title: section.title,
          sortOrder: section.sortOrder,
          isActive: section.isActive,
          translations: sectionTranslations(section),
        }}
        fields={[
          {
            name: 'key',
            label: 'Key',
            type: 'text',
            disabled: true,
            description: 'The key is fixed and cannot be changed.',
          },
          { name: 'title', label: 'Title', type: 'text', required: true },
          { name: 'sortOrder', label: 'Sort order', type: 'number' },
          { name: 'isActive', label: 'Active', type: 'switch' },
          SECTION_TRANSLATIONS_FIELD,
        ]}
        onSubmit={(values) => {
          const changes: SectionChanges = {};
          if (values.title !== section.title) changes.title = values.title;
          if (values.sortOrder !== section.sortOrder) changes.sortOrder = values.sortOrder;
          if (values.isActive !== section.isActive) changes.isActive = values.isActive;
          if (translationsChanged(values.translations, sectionTranslations(section)))
            changes.translations = values.translations;
          return update.mutateAsync({
            id: section.id,
            changes,
            expectedUpdatedAt: values.updatedAt as string,
          });
        }}
        onSuccess={onClose}
        onCancel={onClose}
      />
    </>
  );
}

/**
 * On CREATE there is no `updatedAt`, so a 409 can only be a duplicate key — not
 * a stale write. Re-throw it with a non-conflict status so `<EntityForm>` shows
 * the server's real "section already exists" message instead of the generic
 * concurrency toast (§(g)).
 */
function rethrowKeyConflict(error: unknown): never {
  if (error instanceof ApiError && error.isConflict) {
    throw new ApiError(error.message, 422, error.errorCode);
  }
  throw error;
}
