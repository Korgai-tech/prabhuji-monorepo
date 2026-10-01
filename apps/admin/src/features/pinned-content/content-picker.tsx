import * as React from 'react';

import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import { errorMessage } from '@/lib/api-error';
import type { EntityFormFieldRenderProps } from '@/components/entity-form/entity-form';

import {
  useContentOptionById,
  useContentOptionsForSurface,
  type ContentOption,
} from './use-content-picker';
import type { PinSurface } from './pinned-content-schema';

/**
 * ════════════════════════════════════════════════════════════════════════════
 *  ContentPicker — the `type: 'custom'` field the pinned-content form uses
 *  to bind `contentId` to a real home_feed / status row.
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Data source is IMPLIED BY THE SURFACE: `home` → home_feed rows;
 * `status_all_gods` / `status_deity` → status rows (filtered by deity when
 * the surface is `status_deity`). No `contentType` column, no polymorphic
 * FK — the surface value alone tells the picker which endpoint to hit
 * (mirrors the API's #PATH_DECISION on `content_id`).
 *
 * Selection is a plain list of radio-style cards — thumbnail + title + slug.
 * No combobox: none of Radix's combobox behaviour is needed here, and a native
 * list keeps this testable under jsdom (same reason `status/deity-select.tsx`
 * uses the native select).
 *
 * ── SEARCH HITS THE DATABASE (TAM-175) ──────────────────────────────────────
 * The search box does NOT filter the loaded page — it re-queries the endpoint
 * with `q` (see `use-content-picker.ts` for why the old client-side filter was
 * unfixable). Three consequences shape this component:
 *
 *  - The `<Input>` is rendered ABOVE every early return. A loading branch that
 *    unmounts the input would rip focus out from under the editor mid-word,
 *    now that typing is what triggers the fetch.
 *  - Typing is debounced (`SEARCH_DEBOUNCE_MS`) and the previous page is kept
 *    on screen while the next one loads (`keepPreviousData`), dimmed by the
 *    same `isFetching` affordance the list tables use.
 *  - A page can be a truncated view of a larger match set, so the row count is
 *    stated whenever `total` exceeds what is shown. Silent truncation is the
 *    bug this ticket exists to fix; it must not come back as a quieter one.
 */

/** One request per quarter-second of typing, not one per keystroke. */
const SEARCH_DEBOUNCE_MS = 250;

export function contentPicker(opts: {
  surface: PinSurface | '';
  deitySlug: string;
}) {
  return function render(props: EntityFormFieldRenderProps) {
    return (
      <ContentPicker
        surface={opts.surface}
        deitySlug={opts.deitySlug}
        id={props.id}
        value={typeof props.value === 'string' ? props.value : ''}
        onChange={(next) => props.onChange(next)}
        disabled={props.disabled}
        invalid={props.invalid}
        describedBy={props.describedBy}
      />
    );
  };
}

/** Direct render — used by the hand-rolled pinned-content form (not `<EntityForm>`). */
export function ContentPickerField(props: {
  id: string;
  surface: PinSurface | '';
  deitySlug: string;
  value: string;
  disabled?: boolean;
  invalid?: boolean;
  describedBy?: string;
  onChange: (next: string) => void;
}) {
  return (
    <ContentPicker
      surface={props.surface}
      deitySlug={props.deitySlug}
      id={props.id}
      value={props.value}
      onChange={props.onChange}
      disabled={props.disabled === true}
      invalid={props.invalid === true}
      describedBy={props.describedBy}
    />
  );
}

/** Trailing debounce — the value settles `ms` after the last change. */
function useDebounced<T>(value: T, ms: number): T {
  const [settled, setSettled] = React.useState(value);
  React.useEffect(() => {
    const timer = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return settled;
}

function ContentPicker({
  surface,
  deitySlug,
  id,
  value,
  onChange,
  disabled,
  invalid,
  describedBy,
}: {
  surface: PinSurface | '';
  deitySlug: string;
  id: string;
  value: string;
  onChange: (id: string) => void;
  disabled: boolean;
  invalid: boolean;
  describedBy: string | undefined;
}) {
  const [query, setQuery] = React.useState('');
  const term = useDebounced(query, SEARCH_DEBOUNCE_MS).trim();

  const { data, isLoading, isFetching, isError, error } =
    useContentOptionsForSurface(surface, deitySlug, term);

  // The pinned row, resolved by id: an edit opens on a pin whose content may
  // be nowhere near the current page, and a search term legitimately hides the
  // current pick. Neither may make the selection disappear.
  const selected = useContentOptionById(surface, value);

  const blocked = blockingHint(surface, deitySlug);
  const options = data?.items ?? [];
  const total = data?.total ?? 0;

  const currentPick =
    options.find((item) => item.id === value) ?? selected.data ?? undefined;
  const visible: ContentOption[] =
    currentPick !== undefined && !options.some((item) => item.id === currentPick.id)
      ? [currentPick, ...options]
      : options;

  return (
    <div
      className="grid gap-2"
      aria-invalid={invalid || undefined}
      aria-describedby={describedBy}
    >
      {/* Always mounted — see the header note on focus. */}
      <Input
        id={`${id}-search`}
        type="search"
        placeholder="Search title or slug…"
        value={query}
        disabled={disabled || blocked !== null}
        onChange={(e) => setQuery(e.target.value)}
        aria-label="Search content"
      />

      {blocked !== null ? (
        <p className="text-sm text-muted-foreground">{blocked}</p>
      ) : isError ? (
        <Alert variant="destructive">
          <AlertTitle>Could not load content options</AlertTitle>
          <AlertDescription>
            {errorMessage(error, 'Please try again.')}
          </AlertDescription>
        </Alert>
      ) : isLoading ? (
        <div className="grid gap-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : (
        <>
          <div
            role="radiogroup"
            aria-label="Content items"
            aria-busy={isFetching || undefined}
            className={cn(
              'grid max-h-72 gap-1 overflow-y-auto rounded-md border p-1 transition-opacity',
              isFetching && 'opacity-60',
            )}
          >
            {visible.length === 0 ? (
              <p className="p-3 text-sm text-muted-foreground">
                {term === ''
                  ? 'No content available for this surface yet.'
                  : `No content matches “${term}”.`}
              </p>
            ) : (
              visible.map((item) => (
                <ContentPickerOption
                  key={item.id}
                  name={id}
                  item={item}
                  selected={item.id === value}
                  disabled={disabled}
                  onSelect={() => onChange(item.id)}
                />
              ))
            )}
          </div>

          {total > options.length && (
            <p className="text-xs text-muted-foreground">
              Showing {options.length} of {total} — type to search the rest.
            </p>
          )}
        </>
      )}
    </div>
  );
}

/** The two states where there is no source to query yet. `null` = ready. */
function blockingHint(surface: PinSurface | '', deitySlug: string): string | null {
  if (surface === '') {
    return 'Pick a surface first — the picker shows the matching content.';
  }
  if (surface === 'status_deity' && deitySlug === '') {
    return 'Pick a deity first — the picker shows that deity’s status items.';
  }
  return null;
}

function ContentPickerOption({
  name,
  item,
  selected,
  disabled,
  onSelect,
}: {
  name: string;
  item: ContentOption;
  selected: boolean;
  disabled: boolean;
  onSelect: () => void;
}) {
  const inputId = `${name}-${item.id}`;
  return (
    <label
      htmlFor={inputId}
      className={cn(
        'flex cursor-pointer items-center gap-3 rounded-md border p-2 text-sm transition-colors',
        'hover:bg-accent',
        selected
          ? 'border-primary bg-accent'
          : 'border-transparent',
        disabled && 'pointer-events-none opacity-50',
      )}
    >
      <input
        id={inputId}
        type="radio"
        name={name}
        value={item.id}
        checked={selected}
        disabled={disabled}
        onChange={onSelect}
        className="sr-only"
      />
      <ContentThumbnail url={item.thumbnailUrl} alt={item.title} />
      <div className="grid min-w-0 flex-1 gap-0.5">
        <span className="truncate font-medium">{item.title}</span>
        <code className="truncate text-xs text-muted-foreground">{item.slug}</code>
      </div>
      {selected && (
        <span aria-hidden="true" className="text-xs font-medium text-primary">
          Selected
        </span>
      )}
    </label>
  );
}

function ContentThumbnail({ url, alt }: { url: string | null; alt: string }) {
  const [broken, setBroken] = React.useState(false);
  if (url === null || url === '' || broken) {
    return (
      <div
        aria-hidden="true"
        className="size-10 shrink-0 rounded-md border bg-muted"
        title="No thumbnail"
      />
    );
  }
  return (
    <img
      src={url}
      alt={alt}
      className="size-10 shrink-0 rounded-md border object-cover"
      onError={() => setBroken(true)}
    />
  );
}
