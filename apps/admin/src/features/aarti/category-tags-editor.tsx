import * as React from 'react';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { errorMessage } from '@/lib/api-error';
import { notify } from '@/lib/toast';

import {
  useCategoryOptions,
  useSetItemCategoryTags,
  type ItemDetail,
} from './use-aarti';

/**
 * The item's category-tags editor — a multi-select saved via TAM-90's `PUT`
 * SET-SEMANTICS (send the WHOLE array). Inline on the item EDIT view (an item
 * without tags is not discoverable), but it is a SEPARATE save from the item
 * `PATCH` — the button below makes that explicit so the editor is never left
 * wondering whether their tags were saved with the form (TAM-90
 * #PLAN_UNCERTAINTY).
 *
 * A rejected set (unknown category id) is rolled back server-side, and the
 * mutation invalidates the item detail — so the UI REFETCHES rather than
 * assuming its optimistic state (TAM-91 §(e)). Inactive categories are shown
 * (marked) so an existing tag on a deactivated category stays removable.
 */
export function CategoryTagsEditor({ item }: { item: ItemDetail }) {
  const { data, isLoading, isError, error } = useCategoryOptions();
  const setTags = useSetItemCategoryTags();

  const initial = React.useMemo(
    () => item.categoryTags.map((tag) => tag.id),
    [item.categoryTags],
  );
  // Seeded once on mount; the parent REMOUNTS this editor with
  // `key={item.updatedAt}` so it rebinds to fresh tags after a save /
  // invalidation (same pattern as `<EntityForm>` — no setState-in-effect).
  const [selected, setSelected] = React.useState<string[]>(initial);

  const dirty =
    selected.length !== initial.length ||
    selected.some((id) => !initial.includes(id));

  function toggle(id: string, checked: boolean) {
    setSelected((current) =>
      checked ? [...current, id] : current.filter((c) => c !== id),
    );
  }

  async function save() {
    try {
      await setTags.mutateAsync({ id: item.id, categoryIds: selected });
      notify.success('Category tags saved');
    } catch (err) {
      notify.error(err, 'Could not save category tags.');
    }
  }

  return (
    <section className="grid gap-3" aria-labelledby="category-tags-heading">
      <div>
        <h3 id="category-tags-heading" className="text-sm font-semibold">
          Category tags
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Tag this item into one or more categories. This saves separately from
          the form above — use “Save tags”.
        </p>
      </div>

      {isLoading ? (
        <Skeleton className="h-24 w-full" />
      ) : isError ? (
        <Alert variant="destructive">
          <AlertTitle>Could not load categories</AlertTitle>
          <AlertDescription>{errorMessage(error, 'Please try again.')}</AlertDescription>
        </Alert>
      ) : (
        <>
          <div
            role="group"
            aria-labelledby="category-tags-heading"
            className="grid gap-2 sm:grid-cols-2"
          >
            {(data?.items ?? []).map((category) => {
              const checkboxId = `category-tag-${category.id}`;
              return (
                <label
                  key={category.id}
                  htmlFor={checkboxId}
                  className="flex items-center gap-2 text-sm"
                >
                  <Checkbox
                    id={checkboxId}
                    checked={selected.includes(category.id)}
                    disabled={setTags.isPending}
                    onCheckedChange={(checked) => toggle(category.id, checked === true)}
                  />
                  {category.name}
                  {category.isActive ? '' : ' — inactive'}
                </label>
              );
            })}
          </div>
          <div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!dirty || setTags.isPending}
              onClick={() => void save()}
            >
              {setTags.isPending ? 'Saving…' : 'Save tags'}
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
