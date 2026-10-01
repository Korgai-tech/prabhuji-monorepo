import { Toaster as SonnerToaster } from 'sonner';
import type { ComponentProps } from 'react';

/**
 * Mounted once, at the `<AdminLayout>` root. Every mutation's success/failure
 * feedback lands here — see `src/lib/toast.ts` for the `notify` helpers and the
 * mutation-feedback rule.
 *
 * NOTE: shadcn's generated `sonner.tsx` pulls the active theme from
 * `next-themes`. This app has no theme switcher (light only, tokens in
 * `src/styles.css`), so that dependency is deliberately not added; the toasts
 * are styled from our own tokens instead.
 */
function Toaster({ ...props }: ComponentProps<typeof SonnerToaster>) {
  return (
    <SonnerToaster
      data-slot="toaster"
      position="bottom-right"
      toastOptions={{
        classNames: {
          toast:
            'group rounded-md border bg-popover text-popover-foreground shadow-lg',
          description: 'text-muted-foreground',
          actionButton: 'bg-primary text-primary-foreground',
          cancelButton: 'bg-muted text-muted-foreground',
          error: 'text-destructive',
        },
      }}
      {...props}
    />
  );
}

export { Toaster };
