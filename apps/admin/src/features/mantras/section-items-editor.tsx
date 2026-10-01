import * as React from 'react';
import { ShuffleIcon } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import type { DataTableState } from '@/components/data-table/use-data-table-state';
import { notify } from '@/lib/toast';
import { useMantraItems } from './use-mantra-items';
import { useSetMantraSectionItems, type MantraSectionDetail } from './use-mantra-sections';

/**
 * The hand-picked items editor for a `curated` Mantras homepage section
 * (TAM-160 §Admin UX) — the mechanical mirror of the Aarti one, differing only
 * in the wire field (`itemIds`, not `audioIds`) and the artwork/type fields.
 *
 * ── The model ───────────────────────────────────────────────────────────────
 * The CHECKBOX GRID IS THE MEMBERSHIP. It lists the whole catalogue, one page
 * at a time; a cell is checked exactly when the item is in the section. There
 * is no separate add/remove control — the checkbox is it.
 *
 * ORDER, since there are no up/down buttons:
 *  - checking an item APPENDS it to the END of the list;
 *  - unchecking removes it and the remaining positions close up (no gaps);
 *  - so the saved order is the order you ticked them, and **Reshuffle** is the
 *    only other way to change it.
 *
 * Reordering by drag-and-drop is NOT available — it needs a library this repo
 * forbids (§Out of scope).
 *
 * Save sends the WHOLE `{itemIds}` array in display order (set semantics; the
 * API writes `position` from the index) and carries NO `expectedUpdatedAt`, so
 * LAST SAVE WINS. Ticking, unticking and reshuffling only mutate local state;
 * Save is the single persistence point (§#PATH_DECISION 3).
 */

/** Grid page size. Offset pagination, per ADR C2 — editors get a page count. */
const PAGE_SIZE = 24;

export function MantraSectionItemsEditor({ section }: { section: MantraSectionDetail }) {
  const initial = React.useMemo(
    () => [...section.items].sort((a, b) => a.position - b.position).map((i) => i.itemId),
    [section.items],
  );
  const [ids, setIds] = React.useState<string[]>(initial);
  const [search, setSearch] = React.useState('');
  const [page, setPage] = React.useState(1);
  // Titles of items ticked in this dialog but not saved yet — the grid page
  // they came from can be paged away before Save.
  const [ticked, setTicked] = React.useState(
    () => new Map<string, { title: string; imageUrl: string }>(),
  );
  const save = useSetMantraSectionItems();

  const listState = React.useMemo<DataTableState>(() => {
    const filters: Record<string, string> = {};
    if (search) filters.q = search;
    return { page, pageSize: PAGE_SIZE, filters };
  }, [page, search]);
  const { data } = useMantraItems(listState);

  const candidates = data?.items ?? [];

  // Display data for everything in `ids`: SAVED members carry their own title
  // on the section detail (so a member on another grid page still renders), and
  // a just-ticked one is remembered from the page it was ticked on — it is not
  // saved yet, and the editor may page away before saving.
  const titles = React.useMemo(() => {
    const map = new Map<string, { title: string; imageUrl: string }>();
    for (const i of section.items) map.set(i.itemId, { title: i.title, imageUrl: i.artworkUrl });
    for (const [id, display] of ticked) map.set(id, display);
    return map;
  }, [section.items, ticked]);

  const total = data?.total ?? 0;
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const dirty = ids.length !== initial.length || ids.some((id, i) => id !== initial[i]);

  /** Check → append at the END. Uncheck → drop it; the rest close up. */
  function toggle(item: { id: string; title: string; artworkUrl: string }) {
    if (ids.includes(item.id)) {
      setIds(ids.filter((x) => x !== item.id));
      return;
    }
    setIds([...ids, item.id]);
    setTicked(new Map(ticked).set(item.id, { title: item.title, imageUrl: item.artworkUrl }));
  }

  /** Fisher–Yates, client-side only — never saved on its own. */
  function reshuffle() {
    const next = [...ids];
    for (let i = next.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [next[i], next[j]] = [next[j], next[i]];
    }
    setIds(next);
  }

  async function persist() {
    try {
      await save.mutateAsync({ id: section.id, itemIds: ids });
      notify.success('Curated items saved');
    } catch (error) {
      // The server rejected the WHOLE set (unknown id) and wrote nothing, so its
      // order is still the one we loaded — drop the local order and show it.
      setIds(initial);
      notify.error(error, 'Could not save the curated items.');
    }
  }

  return (
    <section className="grid gap-4" aria-labelledby="mantra-section-items-heading">
      <div>
        <h3 id="mantra-section-items-heading" className="text-sm font-semibold">
          Curated mantras
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Tick a mantra below to add it to the end of the list; untick it to
          remove it. Reshuffle is the only other way to change the order. The app
          previews the first 10 in this order; “Show all” pages through the rest.
          This list has no edit lock — the last save wins.
        </p>
      </div>

      {ids.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No mantras curated yet — the section stays hidden in the app until it
          has at least one.
        </p>
      ) : (
        <ol className="grid gap-2">
          {ids.map((id, index) => {
            const item = titles.get(id);
            return (
              <li key={id} className="flex items-center gap-2 rounded-md border p-2">
                <span className="w-6 shrink-0 text-center text-xs text-muted-foreground tabular-nums">
                  {index + 1}
                </span>
                {item?.imageUrl ? (
                  <img
                    src={item.imageUrl}
                    alt=""
                    className="size-8 shrink-0 rounded border object-cover"
                  />
                ) : (
                  <div aria-hidden="true" className="size-8 shrink-0 rounded border bg-muted" />
                )}
                <span className="min-w-0 flex-1 truncate text-sm">{item?.title}</span>
              </li>
            );
          })}
        </ol>
      )}

      <div className="grid gap-2 border-t pt-4">
        <label
          htmlFor="mantra-section-item-search"
          className="text-xs font-medium text-muted-foreground"
        >
          All mantras — tick to include
        </label>
        <Input
          id="mantra-section-item-search"
          className="w-full sm:w-64"
          value={search}
          placeholder="Search title/slug…"
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
        />

        {candidates.length === 0 ? (
          <p className="text-sm text-muted-foreground">No mantras match this search.</p>
        ) : (
          <div className="grid max-h-64 grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2">
            {candidates.map((item) => (
              <div key={item.id} className="flex items-center gap-2 rounded-md border p-2">
                <Checkbox
                  id={`pick-${item.id}`}
                  checked={ids.includes(item.id)}
                  aria-labelledby={`pick-label-${item.id}`}
                  onCheckedChange={() => toggle(item)}
                />
                {item.artworkUrl ? (
                  <img
                    src={item.artworkUrl}
                    alt=""
                    className="size-8 shrink-0 rounded border object-cover"
                  />
                ) : (
                  <div aria-hidden="true" className="size-8 shrink-0 rounded border bg-muted" />
                )}
                <span
                  id={`pick-label-${item.id}`}
                  className="min-w-0 flex-1 truncate text-sm"
                >
                  {item.title}
                </span>
                <Badge variant="muted">{item.type}</Badge>
              </div>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
          >
            Previous
          </Button>
          <span className="text-xs text-muted-foreground tabular-nums">
            Page {page} of {lastPage} · {total} mantras
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page >= lastPage}
            onClick={() => setPage(page + 1)}
          >
            Next
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button type="button" disabled={!dirty || save.isPending} onClick={() => void persist()}>
          {save.isPending ? 'Saving…' : 'Save order'}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={ids.length < 2 || save.isPending}
          onClick={reshuffle}
        >
          <ShuffleIcon aria-hidden="true" />
          Reshuffle
        </Button>
        {dirty && <span className="text-xs text-muted-foreground">Unsaved changes</span>}
      </div>
    </section>
  );
}
