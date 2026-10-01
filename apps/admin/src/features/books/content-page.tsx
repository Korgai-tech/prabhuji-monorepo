import * as React from 'react';
import { Link } from 'react-router-dom';
import { PencilIcon, PlusIcon, PowerIcon, PowerOffIcon } from 'lucide-react';

import { DataTable } from '@/components/data-table/data-table';
import { useDataTableState } from '@/components/data-table/use-data-table-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { isConflictError, notify } from '@/lib/toast';
import { LANGUAGE_OPTIONS } from '@/lib/languages';

import {
  useBookContentList,
  useUpdateBookContent,
  type BookContentListItem,
} from './use-book-content';
import { CATEGORIES, CONTENT_TYPES, contentTypeLabel, languageLabel } from './book-schema';
import { ContentCreateDialog } from './content-form';
import { DeactivateContentDialog } from './delete-dialogs';

/**
 * Books list — the `<DataTable>` config for `BookContent` (TAM-103 §(b)). Its
 * rows link INTO the book detail page (`/books/content/:id`), where the full
 * fields + structure editor live. The list itself does create (dialog),
 * deactivate and reactivate.
 *
 * Sort offers ONLY TAM-102's allowlist
 * (`title|slug|contentType|category|sortOrder|newlyAddedAt|isActive|createdAt|updatedAt`).
 */
export function BookContentPage() {
  const table = useDataTableState({ sort: 'sortOrder', order: 'asc' });
  const { data, isLoading, isFetching, isError, error, refetch } = useBookContentList(
    table.state,
  );

  const [creating, setCreating] = React.useState(false);
  const [deactivating, setDeactivating] = React.useState<BookContentListItem | null>(null);

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Books</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Devotional literature. A <strong>major book</strong> holds its text in
          chapters (optionally grouped into sub-books); a{' '}
          <strong>direct scripture</strong> holds its text inline. Open a book to
          edit its fields and structure. Deactivating hides it without deleting it.
        </p>
      </div>

      <DataTable<BookContentListItem>
        caption="All books"
        columns={[
          {
            id: 'cover',
            header: 'Cover',
            headerClassName: 'w-0',
            cell: (row) => <Cover row={row} />,
          },
          {
            id: 'title',
            header: 'Title',
            sortField: 'title',
            cell: (row) => (
              <Link
                to={`/books/content/${row.id}`}
                className="font-medium text-primary underline-offset-2 hover:underline"
              >
                {row.title}
              </Link>
            ),
          },
          {
            id: 'slug',
            header: 'Slug',
            sortField: 'slug',
            cell: (row) => <code className="text-xs">{row.slug}</code>,
          },
          {
            id: 'contentType',
            header: 'Type',
            sortField: 'contentType',
            cell: (row) => (
              <Badge variant={row.contentType === 'major_book' ? 'default' : 'secondary'}>
                {contentTypeLabel(row.contentType).toUpperCase()}
              </Badge>
            ),
          },
          {
            id: 'category',
            header: 'Category',
            sortField: 'category',
            cell: (row) =>
              row.category ? (
                <span className="text-sm">{row.category}</span>
              ) : (
                <span className="text-xs text-muted-foreground">—</span>
              ),
          },
          {
            id: 'languages',
            header: 'Languages',
            cell: (row) =>
              row.languages.length === 0 ? (
                <span className="text-xs text-muted-foreground">All</span>
              ) : (
                <span className="text-xs">
                  {row.languages.map((l) => languageLabel(l).replace(/ .*/, '')).join(', ')}
                </span>
              ),
          },
          {
            id: 'newlyAddedAt',
            header: 'Newly added',
            sortField: 'newlyAddedAt',
            cell: (row) =>
              row.newlyAddedAt ? (
                <time dateTime={row.newlyAddedAt} className="text-xs">
                  {new Date(row.newlyAddedAt).toLocaleDateString()}
                </time>
              ) : (
                <span className="text-xs text-muted-foreground">—</span>
              ),
          },
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
          {
            id: 'updatedAt',
            header: 'Updated',
            sortField: 'updatedAt',
            cell: (row) => (
              <time dateTime={row.updatedAt} className="text-xs text-muted-foreground">
                {new Date(row.updatedAt).toLocaleDateString()}
              </time>
            ),
          },
        ]}
        filterFields={[
          { id: 'q', label: 'Search', type: 'text', placeholder: 'Search title/slug…' },
          {
            id: 'contentType',
            label: 'Type',
            type: 'select',
            options: CONTENT_TYPES.map((t) => ({
              value: t.value,
              label: contentTypeLabel(t.value),
            })),
          },
          {
            id: 'category',
            label: 'Category',
            type: 'select',
            options: CATEGORIES.map((c) => ({ value: c.value, label: c.label })),
          },
          {
            id: 'language',
            label: 'Language',
            type: 'select',
            options: LANGUAGE_OPTIONS,
          },
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
          <Button size="sm" onClick={() => setCreating(true)}>
            <PlusIcon aria-hidden="true" />
            New book
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
        emptyMessage="No books match these filters."
        actions={(row) => (
          <RowActions row={row} onDeactivate={() => setDeactivating(row)} />
        )}
      />

      <ContentCreateDialog open={creating} onClose={() => setCreating(false)} />
      <DeactivateContentDialog
        row={deactivating}
        onClose={() => setDeactivating(null)}
      />
    </div>
  );
}

function Cover({ row }: { row: BookContentListItem }) {
  const [broken, setBroken] = React.useState(false);
  if (!row.coverImageUrl || broken) {
    return (
      <div
        aria-hidden="true"
        className="size-8 rounded-md border bg-muted"
        title="No cover"
      />
    );
  }
  return (
    <img
      src={row.coverImageUrl}
      alt=""
      className="size-8 rounded-md border object-cover"
      onError={() => setBroken(true)}
    />
  );
}

function RowActions({
  row,
  onDeactivate,
}: {
  row: BookContentListItem;
  onDeactivate: () => void;
}) {
  const update = useUpdateBookContent();

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
          'This book changed since you opened this list — reload and try again.',
        );
      } else {
        notify.error(error, 'Could not reactivate this book.');
      }
    }
  }

  return (
    <div className="flex justify-end gap-1">
      <Button variant="ghost" size="sm" asChild>
        <Link to={`/books/content/${row.id}`}>
          <PencilIcon aria-hidden="true" />
          Open
        </Link>
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
