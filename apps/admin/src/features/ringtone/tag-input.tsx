import * as React from 'react';
import { XIcon } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import type { EntityFormFieldRenderProps } from '@/components/entity-form/entity-form';

import { ARRAY_MAX_ITEMS, ARRAY_MAX_ITEM_LENGTH } from './ringtone-schema';

/**
 * ════════════════════════════════════════════════════════════════════════════
 *  <TagInput> — a chip input for a STRING-ARRAY column (§(e), #PATH_DECISION).
 * ════════════════════════════════════════════════════════════════════════════
 *
 * `tags` and `searchKeywords` are Postgres array COLUMNS on the ringtone row —
 * NOT join tables — so they are edited inline on the form, not as a sub-resource.
 * They are also DISTINCT concepts (free-text tags vs curated search terms) and
 * so are two SEPARATE inputs, never merged.
 *
 * This is deliberately NOT the relation multi-select TAM-91/93 build: those pick
 * existing rows by id; this collects free strings. Enter or comma commits an
 * entry; on commit we TRIM and DE-DUP (case-insensitive) and enforce the same
 * bounds TAM-94 pins (≤ 50 items × ≤ 64 chars) — as FAST FEEDBACK only, the
 * server trims/de-dups/bounds authoritatively.
 *
 * It plugs into `<EntityForm>` via `type: 'custom'` — it holds a `string[]`, and
 * calls `onChange(nextArray)` on every mutation.
 */
export function TagInput({
  id,
  value,
  onChange,
  disabled,
  invalid,
  describedBy,
  placeholder,
}: EntityFormFieldRenderProps & { placeholder?: string }) {
  const items = Array.isArray(value) ? (value as string[]) : [];
  const [draft, setDraft] = React.useState('');

  const atLimit = items.length >= ARRAY_MAX_ITEMS;

  function commit(raw: string) {
    const entry = raw.trim().slice(0, ARRAY_MAX_ITEM_LENGTH);
    if (entry === '') return;
    // Case-insensitive de-dup — a curated list gains nothing from "Ganesh" and
    // "ganesh" both being present, and the server would collapse them anyway.
    const exists = items.some((item) => item.toLowerCase() === entry.toLowerCase());
    if (exists || atLimit) {
      setDraft('');
      return;
    }
    onChange([...items, entry]);
    setDraft('');
  }

  function removeAt(index: number) {
    onChange(items.filter((_, i) => i !== index));
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      commit(draft);
    } else if (event.key === 'Backspace' && draft === '' && items.length > 0) {
      // Backspace on an empty draft pops the last chip — the usual chip idiom.
      removeAt(items.length - 1);
    }
  }

  return (
    <div className="grid gap-2" data-slot="tag-input">
      {items.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Selected entries">
          {items.map((item, index) => (
            <li key={`${item}-${index}`}>
              <Badge variant="secondary" className="gap-1 pr-1">
                <span>{item}</span>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => removeAt(index)}
                  aria-label={`Remove ${item}`}
                  className={cn(
                    'inline-flex size-4 items-center justify-center rounded-sm',
                    'hover:bg-muted-foreground/20 focus-visible:ring-ring/50 focus-visible:ring-2 focus-visible:outline-none',
                    'disabled:pointer-events-none disabled:opacity-50',
                  )}
                >
                  <XIcon className="size-3" aria-hidden="true" />
                </button>
              </Badge>
            </li>
          ))}
        </ul>
      )}
      <Input
        id={id}
        type="text"
        value={draft}
        disabled={disabled || atLimit}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        placeholder={
          atLimit ? `Maximum ${ARRAY_MAX_ITEMS} reached` : (placeholder ?? 'Type and press Enter…')
        }
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => commit(draft)}
      />
    </div>
  );
}

/** Adapter for an `<EntityForm>` `type: 'custom'` field's `render`. */
export function tagInputField(config?: { placeholder?: string }) {
  return function renderTagInput(props: EntityFormFieldRenderProps) {
    return <TagInput {...props} placeholder={config?.placeholder} />;
  };
}
