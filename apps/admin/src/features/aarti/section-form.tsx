import { useQueryClient } from '@tanstack/react-query';

import { EntityForm } from '@/components/entity-form/entity-form';
import type { EntityFormField } from '@/components/entity-form/entity-form';
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
  useAartiSection,
  useCreateSection,
  useUpdateSection,
  type SectionDetail,
  type SectionType,
} from './use-aarti';
import {
  SECTION_TYPES,
  SectionFormSchema,
  sectionTypeLabel,
  type SectionFormValues,
} from './aarti-schema';
import { rethrowCreateConflict } from './rethrow-create-conflict';
import { SectionItemsEditor } from './section-items-editor';

/**
 * The Aarti homepage-section create/edit form (TAM-91 §(d)).
 *
 *  - `sectionType` is CREATE-ONLY and chosen from the known set via a `<select>`
 *    — NEVER a free text input (an unknown value creates a section the server
 *    cannot resolve, which renders as nothing with no error; TAM-90 AC (g)). On
 *    edit it is READ-ONLY with a short explanation.
 *  - A duplicate `sectionType` on create → the API's 409 surfaces via the form
 *    error banner (`rethrowCreateConflict`).
 *  - `itemQuery` is documented as UNUSED by the Phase-1 dynamic section types
 *    (TAM-90) — so it is HIDDEN here rather than shown as a field that does
 *    nothing (#PLAN_UNCERTAINTY: an inert editable field is worse than none).
 *  - A `curated` section (TAM-160) is the ONE type with hand-picked items: on
 *    edit it renders `<SectionItemsEditor>` below the form; every other type
 *    gets an explanation instead (the API 400s an item write on them).
 */

export type SectionFormState = { kind: 'create' } | { kind: 'edit'; id: string } | null;

export function SectionFormDialog({
  state,
  onClose,
}: {
  state: SectionFormState;
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

const SECTION_TYPE_OPTIONS = SECTION_TYPES.map((s) => ({ label: s.label, value: s.value }));

function CreateSection({ onClose }: { onClose: () => void }) {
  const create = useCreateSection();

  return (
    <>
      <DialogHeader>
        <DialogTitle>New homepage section</DialogTitle>
        <DialogDescription>
          Pick a section type from the known set. The type is permanent — the app
          resolves each type dynamically, and an unknown type would render as
          nothing. For a “Curated (hand-picked)” section, save it first, then pick
          its aartis from the edit view. New sections start <strong>inactive</strong>
          — switch Active on once the section has the items you want.
        </DialogDescription>
      </DialogHeader>

      <EntityForm<SectionFormValues>
        mode="create"
        entityLabel="Section"
        schema={SectionFormSchema}
        defaultValues={{
          sectionType: 'recently_played',
          title: '',
          sortOrder: 0,
          // OFF by default: a new section (especially a curated one, which
          // cannot get items until it exists) would otherwise be published
          // empty — and the API hides empty sections, so the editor gets no
          // feedback either way. Enabling is a deliberate second step.
          isActive: false,
          translations: [],
        }}
        fields={[
          {
            name: 'sectionType',
            label: 'Section type',
            type: 'select',
            required: true,
            options: SECTION_TYPE_OPTIONS,
            description:
              'Permanent — cannot be changed after creation. Only “Curated” sections take hand-picked items; the rest resolve automatically.',
          },
          ...SECTION_EDITABLE_FIELDS,
        ]}
        onSubmit={(values) =>
          create
            .mutateAsync({
              sectionType: values.sectionType,
              title: values.title,
              sortOrder: values.sortOrder,
              isActive: values.isActive,
              translations: values.translations,
            })
            .catch(rethrowCreateConflict)
        }
        onSuccess={onClose}
        onCancel={onClose}
      />
    </>
  );
}

function EditSection({ id, onClose }: { id: string; onClose: () => void }) {
  const { data: section, isLoading, isError, error } = useAartiSection(id);

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
        <DialogTitle>Edit “{section.title}”</DialogTitle>
        <DialogDescription>
          The section type is fixed at creation — the app resolves it dynamically,
          so it cannot be changed here.
        </DialogDescription>
      </DialogHeader>
      {/* REMOUNT on `updatedAt` so the form rebinds to fresh data. */}
      <EditSectionForm key={section.updatedAt} section={section} onClose={onClose} />

      <div className="border-t pt-4">
        <SectionItemsSection section={section} />
      </div>
    </>
  );
}

/** Hand-picked items for a `curated` section; an explanation for the resolved
 *  kinds (the API 400s an item write on them). */
function SectionItemsSection({ section }: { section: SectionDetail }) {
  if (section.sectionType === 'curated') {
    return <SectionItemsEditor section={section} />;
  }

  return (
    <Alert>
      <AlertTitle>Automatically resolved</AlertTitle>
      <AlertDescription>
        “{sectionTypeLabel(section.sectionType)}” is resolved automatically by the
        server — it takes no hand-picked items. Create a “Curated (hand-picked)”
        section to choose and order aartis yourself.
      </AlertDescription>
    </Alert>
  );
}

function EditSectionForm({
  section,
  onClose,
}: {
  section: SectionDetail;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const update = useUpdateSection();

  return (
    <EntityForm<SectionFormValues>
      mode="edit"
      entityLabel="Section"
      schema={SectionFormSchema}
      updatedAt={section.updatedAt}
      defaultValues={{
        // `sectionType` is create-only; it is displayed disabled and never sent.
        sectionType: section.sectionType as SectionType,
        title: section.title,
        sortOrder: section.sortOrder,
        isActive: section.isActive,
        translations: sectionTranslations(section),
      }}
      fields={[
        {
          name: 'sectionType',
          label: 'Section type',
          type: 'select',
          disabled: true,
          options: SECTION_TYPE_OPTIONS,
          description: `Fixed at creation (${sectionTypeLabel(section.sectionType)}) — cannot be changed.`,
        },
        ...SECTION_EDITABLE_FIELDS,
      ]}
      // SEND ONLY WHAT CHANGED — never send `sectionType` (create-only).
      onSubmit={(values) => {
        const changes: {
          title?: string;
          sortOrder?: number;
          isActive?: boolean;
          translations?: SectionFormValues['translations'];
        } = {};
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
      onConflict={() => {
        void qc.invalidateQueries({ queryKey: adminKeys.detail('aarti-section', section.id) });
      }}
      onCancel={onClose}
    />
  );
}

const SECTION_EDITABLE_FIELDS = [
  { name: 'title', label: 'Title', type: 'text', required: true },
  {
    name: 'sortOrder',
    label: 'Sort order',
    type: 'number',
    description: 'Lower numbers appear first on the homepage.',
  },
  { name: 'isActive', label: 'Active', type: 'switch' },
  {
    name: 'translations',
    label: 'Title translations',
    type: 'custom',
    render: translationsField({
      fields: [{ name: 'title', label: 'Title', required: true, maxLength: 200 }],
      title: 'Title translations',
    }),
  },
] satisfies EntityFormField<SectionFormValues>[];

/** Map a loaded section's translations into the form value shape. */
function sectionTranslations(s: SectionDetail): SectionFormValues['translations'] {
  return s.translations.map((t) => ({ locale: t.locale, title: t.title }));
}
