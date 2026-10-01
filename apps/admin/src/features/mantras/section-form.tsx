import { useQueryClient } from '@tanstack/react-query';

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
import { errorMessage } from '@/lib/api-error';
import { adminKeys } from '@/lib/query-keys';

import {
  useCreateMantraSection,
  useMantraSection,
  useUpdateMantraSection,
  type MantraSectionChanges,
  type MantraSectionDetail,
} from './use-mantra-sections';
import {
  MantraSectionFormSchema,
  type MantraSectionFormValues,
  SECTION_TYPE_OPTIONS,
  LAYOUT_TYPE_OPTIONS,
} from './mantra-schemas';
import { rethrowDuplicateConflict } from './conflict';
import { MantraSectionItemsEditor } from './section-items-editor';

/**
 * Mantra homepage-section create/edit form. `sectionType` is a SELECT of the
 * known set and is CREATE-ONLY (read-only on edit with an explanation — it keys
 * the section's client renderer). `layoutType` is a SELECT (never free text — an
 * unknown value has no renderer). Duplicate `sectionType` → 409 surfaced.
 *
 * A `curated` section (TAM-160) is the ONE type with hand-picked items and the
 * ONE type that is not unique per module: on edit it renders
 * `<MantraSectionItemsEditor>` below the form; every other type gets an
 * explanation instead (the API 400s an item write on them).
 */

export type MantraSectionFormState =
  | { kind: 'create' }
  | { kind: 'edit'; id: string }
  | null;

export function MantraSectionFormDialog({
  state,
  onClose,
}: {
  state: MantraSectionFormState;
  onClose: () => void;
}) {
  return (
    <Dialog open={state !== null} onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        {state?.kind === 'edit' ? (
          <EditSection id={state.id} onClose={onClose} />
        ) : (
          <CreateSection onClose={onClose} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function buildFields(mode: 'create' | 'edit') {
  return [
    {
      name: 'sectionType' as const,
      label: 'Section type',
      type: 'select' as const,
      required: mode === 'create',
      disabled: mode === 'edit',
      placeholder: 'Select a section type…',
      options: SECTION_TYPE_OPTIONS,
      description:
        mode === 'edit'
          ? 'Section type keys the client renderer and cannot be changed after creation.'
          : 'Each built-in section type is unique — a duplicate is rejected. “Curated” is the exception: create as many as you like, then pick their mantras from the edit view.',
    },
    { name: 'title' as const, label: 'Title', type: 'text' as const, required: true },
    {
      name: 'layoutType' as const,
      label: 'Layout',
      type: 'select' as const,
      required: true,
      placeholder: 'Select a layout…',
      options: LAYOUT_TYPE_OPTIONS,
      description: 'How this section is rendered on the home screen.',
    },
    {
      name: 'showAllEnabled' as const,
      label: 'Show “See all”',
      type: 'switch' as const,
    },
    {
      name: 'sortOrder' as const,
      label: 'Sort order',
      type: 'number' as const,
      description: 'Lower numbers appear first.',
    },
    { name: 'isActive' as const, label: 'Active', type: 'switch' as const },
    {
      name: 'translations' as const,
      label: 'Title translations',
      type: 'custom' as const,
      render: translationsField({
        fields: [{ name: 'title', label: 'Title', required: true, maxLength: 200 }],
        title: 'Title translations',
      }),
    },
  ];
}

/** Map a loaded section's translations into the form value shape. */
function sectionTranslations(
  s: MantraSectionDetail,
): MantraSectionFormValues['translations'] {
  return s.translations.map((t) => ({ locale: t.locale, title: t.title }));
}

function CreateSection({ onClose }: { onClose: () => void }) {
  const create = useCreateMantraSection();

  return (
    <>
      <DialogHeader>
        <DialogTitle>New homepage section</DialogTitle>
        <DialogDescription>
          The section type keys the client renderer and cannot be changed later.
          For a “Curated (hand-picked)” section, save it first, then pick its
          mantras from the edit view. New sections start <strong>inactive</strong>
          — switch Active on once the section has the items you want.
        </DialogDescription>
      </DialogHeader>

      <EntityForm<MantraSectionFormValues>
        mode="create"
        entityLabel="Section"
        schema={MantraSectionFormSchema}
        defaultValues={{
          sectionType: 'newly_added',
          title: '',
          layoutType: 'horizontal_cards',
          showAllEnabled: true,
          sortOrder: 0,
          // OFF by default: a new section (especially a curated one, which
          // cannot get items until it exists) would otherwise be published
          // empty — and the API hides empty sections, so the editor gets no
          // feedback either way. Enabling is a deliberate second step.
          isActive: false,
          translations: [],
        }}
        fields={buildFields('create')}
        onSubmit={(values) =>
          create
            .mutateAsync({
              sectionType: values.sectionType,
              title: values.title,
              layoutType: values.layoutType,
              showAllEnabled: values.showAllEnabled,
              sortOrder: values.sortOrder,
              isActive: values.isActive,
              translations: values.translations,
            })
            .catch(rethrowDuplicateConflict)
        }
        onSuccess={onClose}
        onCancel={onClose}
      />
    </>
  );
}

function EditSection({ id, onClose }: { id: string; onClose: () => void }) {
  const { data: section, isLoading, isError, error } = useMantraSection(id);

  if (isLoading) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>Edit section</DialogTitle>
          <DialogDescription>Loading…</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <Skeleton className="h-9 w-full" />
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
          <DialogTitle>Edit section</DialogTitle>
        </DialogHeader>
        <Alert variant="destructive">
          <AlertTitle>Could not load this section</AlertTitle>
          <AlertDescription>{errorMessage(error, 'Please try again.')}</AlertDescription>
        </Alert>
      </>
    );
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Edit “{section.sectionType}”</DialogTitle>
        <DialogDescription>Update the title, layout, ordering and status.</DialogDescription>
      </DialogHeader>
      {/* REMOUNT on `updatedAt` so the form rebinds after an invalidation. */}
      <EditSectionForm key={section.updatedAt} section={section} onClose={onClose} />

      <div className="border-t pt-4">
        <SectionItemsSection section={section} />
      </div>
    </>
  );
}

/** Hand-picked items for a `curated` section; an explanation for the resolved
 *  kinds (the API 400s an item write on them). */
function SectionItemsSection({ section }: { section: MantraSectionDetail }) {
  if (section.sectionType === 'curated') {
    return <MantraSectionItemsEditor section={section} />;
  }

  return (
    <Alert>
      <AlertTitle>Automatically resolved</AlertTitle>
      <AlertDescription>
        This section is resolved automatically by the server — it takes no
        hand-picked items. Create a “Curated (hand-picked)” section to choose and
        order mantras yourself.
      </AlertDescription>
    </Alert>
  );
}

function EditSectionForm({
  section,
  onClose,
}: {
  section: MantraSectionDetail;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const update = useUpdateMantraSection();

  return (
    <EntityForm<MantraSectionFormValues>
      mode="edit"
      entityLabel="Section"
      schema={MantraSectionFormSchema}
      updatedAt={section.updatedAt}
      defaultValues={{
        sectionType: section.sectionType,
        title: section.title,
        layoutType: section.layoutType,
        showAllEnabled: section.showAllEnabled,
        sortOrder: section.sortOrder,
        isActive: section.isActive,
        translations: sectionTranslations(section),
      }}
      fields={buildFields('edit')}
      // SEND ONLY WHAT CHANGED — never send sectionType (create-only).
      onSubmit={(values) => {
        const changes: MantraSectionChanges = {};
        if (values.title !== section.title) changes.title = values.title;
        if (values.layoutType !== section.layoutType) changes.layoutType = values.layoutType;
        if (values.showAllEnabled !== section.showAllEnabled)
          changes.showAllEnabled = values.showAllEnabled;
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
      onConflict={() => {
        void qc.invalidateQueries({ queryKey: adminKeys.detail('mantra-section', section.id) });
      }}
      onCancel={onClose}
    />
  );
}
