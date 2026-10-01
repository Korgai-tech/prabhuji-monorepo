import * as React from 'react';
import { ChevronDownIcon } from 'lucide-react';

import { cn } from '@/lib/utils';

/**
 * NOTE — DELIBERATE DEVIATION FROM shadcn's Radix `<Select>`:
 * this is a styled NATIVE `<select>`, not `@radix-ui/react-select`.
 *
 * Why (TAM-86 AC (c) allows only the Radix packages a primitive "genuinely
 * needs"):
 *  - a native `<select>` is already keyboard- and screen-reader-accessible,
 *    and gets the platform picker on touch devices for free;
 *  - Radix Select needs `ResizeObserver` / `hasPointerCapture` / `DOMRect`
 *    polyfills to be driven under jsdom, which would tax every test in the
 *    nine module UI tickets that use a select;
 *  - the admin's selects are value pickers (page size, enum fields, filters),
 *    not searchable comboboxes — none of Radix Select's extra behaviour is used.
 *
 * It is still added "the standard shadcn way": cva-free but `cn()`-composed and
 * token-styled, matching `input.tsx`. If a module ever genuinely needs a
 * searchable combobox, that is a System Architect call + a pattern update —
 * do not add one silently.
 */
function Select({ className, children, ...props }: React.ComponentProps<'select'>) {
  return (
    <div className="relative w-full" data-slot="select">
      <select
        className={cn(
          'flex h-9 w-full appearance-none rounded-md border bg-background py-1 pr-8 pl-3 text-sm shadow-xs transition-[color,box-shadow] outline-none',
          'focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]',
          'disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50',
          'aria-invalid:border-destructive aria-invalid:ring-destructive/20',
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDownIcon
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 opacity-50"
      />
    </div>
  );
}

export { Select };
