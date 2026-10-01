import * as React from 'react';
import { ArrowDownIcon, ArrowUpIcon, XIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import type { DataTableState } from '@/components/data-table/use-data-table-state';
import { notify } from '@/lib/toast';
import { useWallpapers, type WallpaperListItem } from './use-wallpapers';
import {
  useSetWallpaperRowItems,
  type WallpaperRowDetail,
} from './use-wallpaper-rows';

/**
 * The curated-items editor for a `custom` homepage row (TAM-97 §(f)). ONLY
 * rendered for `custom` rows — the other four ignore curated items and TAM-96
 * 400s the write (§#EXPORT_CRITICAL); `row-form.tsx` shows an explanation
 * instead for them.
 *
 * An ORDERED picker: add wallpapers, remove them, and reorder with keyboard-
 * reachable up/down buttons (NOT drag-and-drop — that needs a library this repo
 * does not have; §#PATH_DECISION). Save sends the WHOLE `{wallpaperIds}` array
 * in display order (set semantics; TAM-96 writes `position` from the index). A
 * rejected set (unknown id) → the row is refetched; the previous order stands.
 */
export function RowItemsEditor({ row }: { row: WallpaperRowDetail }) {
  const initial = React.useMemo(
    () => [...row.items].sort((a, b) => a.position - b.position).map((i) => i.wallpaperId),
    [row.items],
  );
  const [ids, setIds] = React.useState<string[]>(initial);
  const [search, setSearch] = React.useState('');
  const [pick, setPick] = React.useState('');
  const save = useSetWallpaperRowItems();

  // Resolve wallpaper ids → titles/thumbnails, and offer the not-yet-added ones.
  const listState = React.useMemo<DataTableState>(() => {
    const filters: Record<string, string> = {};
    if (search) filters.q = search;
    return { page: 1, pageSize: 100, filters };
  }, [search]);
  const { data } = useWallpapers(listState);
  const byId = React.useMemo(() => {
    const map = new Map<string, WallpaperListItem>();
    for (const w of data?.items ?? []) map.set(w.id, w);
    return map;
  }, [data]);

  const available = (data?.items ?? []).filter((w) => !ids.includes(w.id));
  const dirty = ids.length !== initial.length || ids.some((id, i) => id !== initial[i]);

  function move(index: number, delta: number) {
    const next = [...ids];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setIds(next);
  }

  function addPicked() {
    if (pick === '' || ids.includes(pick)) return;
    setIds([...ids, pick]);
    setPick('');
  }

  async function persist() {
    try {
      await save.mutateAsync({ id: row.id, wallpaperIds: ids });
      notify.success('Curated items saved');
    } catch (error) {
      // The mutation invalidates the row on settle; the parent refetches and
      // remounts this editor with the server's (unchanged) order.
      notify.error(error, 'Could not save the curated items.');
    }
  }

  return (
    <section className="grid gap-4" aria-labelledby="row-items-heading">
      <div>
        <h3 id="row-items-heading" className="text-sm font-semibold">
          Curated wallpapers
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Add wallpapers and set their order. The app shows them top-to-bottom in
          this exact order.
        </p>
      </div>

      {ids.length === 0 ? (
        <p className="text-sm text-muted-foreground">No wallpapers curated yet.</p>
      ) : (
        <ol className="grid gap-2">
          {ids.map((id, index) => {
            const w = byId.get(id);
            return (
              <li key={id} className="flex items-center gap-2 rounded-md border p-2">
                <span className="w-6 shrink-0 text-center text-xs text-muted-foreground tabular-nums">
                  {index + 1}
                </span>
                {w?.thumbnailUrl ? (
                  <img src={w.thumbnailUrl} alt="" className="size-8 rounded border object-cover" />
                ) : (
                  <div aria-hidden="true" className="size-8 rounded border bg-muted" />
                )}
                <span className="flex-1 truncate text-sm">
                  {w ? w.title : <code className="text-xs">{id}</code>}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={index === 0}
                  aria-label={`Move ${w?.title ?? id} up`}
                  onClick={() => move(index, -1)}
                >
                  <ArrowUpIcon aria-hidden="true" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={index === ids.length - 1}
                  aria-label={`Move ${w?.title ?? id} down`}
                  onClick={() => move(index, 1)}
                >
                  <ArrowDownIcon aria-hidden="true" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={`Remove ${w?.title ?? id}`}
                  onClick={() => setIds(ids.filter((x) => x !== id))}
                >
                  <XIcon aria-hidden="true" />
                </Button>
              </li>
            );
          })}
        </ol>
      )}

      <div className="grid gap-2 border-t pt-4">
        <label htmlFor="row-item-search" className="text-xs font-medium text-muted-foreground">
          Find a wallpaper to add
        </label>
        <div className="flex flex-wrap items-end gap-2">
          <Input
            id="row-item-search"
            className="w-48"
            value={search}
            placeholder="Search title/slug…"
            onChange={(event) => setSearch(event.target.value)}
          />
          <Select
            aria-label="Wallpaper to add"
            className="w-56"
            value={pick}
            onChange={(event) => setPick(event.target.value)}
          >
            <option value="">Select a wallpaper…</option>
            {available.map((w) => (
              <option key={w.id} value={w.id}>
                {w.title}
              </option>
            ))}
          </Select>
          <Button type="button" variant="outline" size="sm" disabled={pick === ''} onClick={addPicked}>
            Add
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button type="button" disabled={!dirty || save.isPending} onClick={() => void persist()}>
          {save.isPending ? 'Saving…' : 'Save order'}
        </Button>
        {dirty && <span className="text-xs text-muted-foreground">Unsaved changes</span>}
      </div>
    </section>
  );
}
