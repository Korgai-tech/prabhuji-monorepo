import { useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeftIcon } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { errorMessage } from '@/lib/api-error';
import { adminKeys } from '@/lib/query-keys';

import { useBookContent } from './use-book-content';
import { contentTypeLabel } from './book-schema';
import { ContentEditForm } from './content-form';
import { StructureTree } from './structure-tree';

/**
 * Book detail — the fields editor PLUS the structure section, rendered per
 * `contentType` (TAM-103 §(c)):
 *
 *  - `major_book`     → the fields form + the `<StructureTree>` (sub-books &
 *    chapters). "Add sub-book"/"Add chapter" exist ONLY here.
 *  - `direct_scripture` → the fields form ONLY (its `contentBody` editor is IN
 *    the form). There is NO structure section, and no add-chapter/add-sub-book
 *    button ever renders — TAM-102 would 400 them, but the editor never gets
 *    the option (§#EXPORT_CRITICAL).
 */
export function BookDetailPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const { data: row, isLoading, isError, error } = useBookContent(id);

  return (
    <div className="grid gap-6">
      <div>
        <Button variant="ghost" size="sm" asChild className="mb-2 -ml-2">
          <Link to="/books/content">
            <ArrowLeftIcon aria-hidden="true" />
            All books
          </Link>
        </Button>

        {isLoading ? (
          <Skeleton className="h-8 w-64" />
        ) : row ? (
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold">{row.title}</h1>
            <Badge variant={row.contentType === 'major_book' ? 'default' : 'secondary'}>
              {contentTypeLabel(row.contentType).toUpperCase()}
            </Badge>
            {!row.isActive ? <Badge variant="muted">Inactive</Badge> : null}
          </div>
        ) : (
          <h1 className="text-2xl font-semibold">Book</h1>
        )}
      </div>

      {isLoading ? (
        <div className="grid gap-3">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : isError || !row ? (
        <Alert variant="destructive">
          <AlertTitle>Could not load this book</AlertTitle>
          <AlertDescription>{errorMessage(error, 'Please try again.')}</AlertDescription>
        </Alert>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
              <CardDescription>
                {row.contentType === 'direct_scripture'
                  ? 'A direct scripture — its text is edited inline below.'
                  : 'Book fields. Its chapters are managed in the Structure section below.'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ContentEditForm
                row={row}
                onConflict={() =>
                  void qc.invalidateQueries({
                    queryKey: adminKeys.detail('book-content', row.id),
                  })
                }
              />
            </CardContent>
          </Card>

          {/* STRUCTURE — major_book ONLY. Scripture has no structure section at
              all (its contentBody lives in the form above). */}
          {row.contentType === 'major_book' ? (
            <Card>
              <CardContent className="pt-6">
                <StructureTree contentId={row.id} />
              </CardContent>
            </Card>
          ) : null}
        </>
      )}
    </div>
  );
}
