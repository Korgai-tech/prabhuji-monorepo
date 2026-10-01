import { useCallback, useMemo, useState } from 'react';

export type SortOrder = 'asc' | 'desc';

/**
 * The pagination/sort/filter state of one list view — the exact shape ADR C2's
 * admin list endpoints take as a querystring (`?page=&pageSize=&sort=&order=`
 * plus per-entity filter params).
 */
export interface DataTableState {
  /** 1-based, matching the API. */
  page: number;
  pageSize: number;
  /** Must be on the entity's TAM-82 `sortQuery` allowlist. */
  sort?: string;
  order?: SortOrder;
  /** Per-entity filter params, e.g. `{ q: 'ganesh', isActive: 'true' }`. */
  filters: Record<string, string>;
}

export interface UseDataTableStateResult {
  state: DataTableState;
  setState: (next: DataTableState) => void;
  reset: () => void;
}

/** Default page size — ADR C2 (`pageSize` default 25, capped at 100). */
export const DEFAULT_PAGE_SIZE = 25;

/**
 * Owns one list view's query state. Pair with `<DataTable>`:
 *
 * ```tsx
 * const table = useDataTableState({ sort: 'createdAt', order: 'desc' });
 * const { data } = useDeities(table.state);            // your query hook
 * <DataTable state={table.state} onStateChange={table.setState} … />
 * ```
 *
 * Feed `table.state` straight into your query key
 * (`adminKeys.list('deities', state)`) and into the request's querystring, so
 * pagination, sorting and filtering are all just cache keys.
 */
export function useDataTableState(
  initial?: Partial<DataTableState>,
): UseDataTableStateResult {
  const initialState = useMemo<DataTableState>(
    () => ({
      page: initial?.page ?? 1,
      pageSize: initial?.pageSize ?? DEFAULT_PAGE_SIZE,
      sort: initial?.sort,
      order: initial?.order ?? (initial?.sort ? 'asc' : undefined),
      filters: initial?.filters ?? {},
    }),
    // Snapshot the initial state once; later prop changes must not clobber a
    // page the editor has navigated to.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const [state, setState] = useState<DataTableState>(initialState);
  const reset = useCallback(() => setState(initialState), [initialState]);

  return { state, setState, reset };
}

/**
 * Turns `DataTableState` into an admin list querystring object.
 *
 * Undefined/empty values are omitted rather than sent blank, so the request
 * matches what the API's Zod querystring schema expects.
 *
 * ```ts
 * api.GET('/admin/taxonomy/deities', { params: { query: toListQuery(state) } })
 * ```
 */
export function toListQuery(state: DataTableState): Record<string, string | number> {
  const query: Record<string, string | number> = {
    page: state.page,
    pageSize: state.pageSize,
  };
  if (state.sort) {
    query.sort = state.sort;
    query.order = state.order ?? 'asc';
  }
  for (const [key, value] of Object.entries(state.filters)) {
    if (value !== '') query[key] = value;
  }
  return query;
}
