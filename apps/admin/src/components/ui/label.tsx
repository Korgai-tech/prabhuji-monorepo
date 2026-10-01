import * as React from 'react';
import type { VariantProps } from 'class-variance-authority';
import { cva } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const labelVariants = cva(
  'flex items-center gap-2 text-sm leading-none font-medium select-none',
  {
    variants: {
      /**
       * `muted` dims the label when its control is disabled — the label is a
       * plain `<label>`, so it cannot inherit a Radix disabled context.
       */
      variant: {
        default: 'text-foreground',
        muted: 'text-muted-foreground',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

export interface LabelProps
  extends React.ComponentProps<'label'>,
    VariantProps<typeof labelVariants> {}

/**
 * NOTE: this is a plain `<label>`, not `@radix-ui/react-label`. A native
 * `<label htmlFor>` is already fully accessible and needs no dependency;
 * Radix's Root only adds double-click text-selection suppression. Per
 * TAM-86 AC (c) — "add only the Radix packages the chosen primitives
 * genuinely need".
 */
function Label({ className, variant, ...props }: LabelProps) {
  return (
    <label
      data-slot="label"
      className={cn(labelVariants({ variant, className }))}
      {...props}
    />
  );
}

export { Label, labelVariants };
