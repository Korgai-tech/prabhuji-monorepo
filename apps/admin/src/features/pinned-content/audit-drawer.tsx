import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { errorMessage } from '@/lib/api-error';

import {
  usePinnedContentAudit,
  type PinnedContentAuditRow,
} from './use-pinned-content';
import { formatIst } from './pinned-content-schema';

/**
 * ════════════════════════════════════════════════════════════════════════════
 *  Audit "drawer" — a read-only view of the append-log for one pin.
 * ════════════════════════════════════════════════════════════════════════════
 *
 * The spec calls this a "drawer" but the admin SPA has no `<Drawer>` primitive
 * yet; a right-aligned dialog carries the same shape and stays testable under
 * jsdom for free (same reason `paywall/utm-overrides-page.tsx` uses a Dialog
 * for its confirmations). The vocabulary word here is what matters — one row
 * per CREATE / UPDATE / DELETE / RESTORE, in reverse-chronological order,
 * with a diff for UPDATE.
 *
 * The API returns rows newest-first per the spec; we render them as-is.
 */
export function AuditDrawer({
  pinId,
  onClose,
}: {
  pinId: string | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={pinId !== null} onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Audit log</DialogTitle>
          <DialogDescription>
            Every action on this pin — actor and timestamp, plus a per-field
            diff for updates. Read-only.
          </DialogDescription>
        </DialogHeader>
        {pinId !== null && <AuditContent pinId={pinId} />}
      </DialogContent>
    </Dialog>
  );
}

function AuditContent({ pinId }: { pinId: string }) {
  const { data, isLoading, isError, error } = usePinnedContentAudit(pinId);

  if (isLoading) {
    return (
      <div className="grid gap-2">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    );
  }

  if (isError) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Could not load the audit log</AlertTitle>
        <AlertDescription>
          {errorMessage(error, 'Please try again.')}
        </AlertDescription>
      </Alert>
    );
  }

  if (!data || data.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No audit entries yet.
      </p>
    );
  }

  return (
    <ul className="grid gap-3">
      {data.map((row) => (
        <li key={row.id} className="rounded-md border p-3">
          <AuditEntry row={row} />
        </li>
      ))}
    </ul>
  );
}

function AuditEntry({ row }: { row: PinnedContentAuditRow }) {
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ActionBadge action={row.action} />
          <span className="text-sm text-muted-foreground">
            by <code className="text-xs">{row.actorUserId}</code>
          </span>
        </div>
        <time
          dateTime={row.createdAt}
          className="text-xs text-muted-foreground"
        >
          {formatIst(row.createdAt)}
        </time>
      </div>
      {row.action === 'update' && row.diff !== null && row.diff !== undefined ? (
        <DiffTable diff={row.diff} />
      ) : null}
    </div>
  );
}

function ActionBadge({ action }: { action: PinnedContentAuditRow['action'] }) {
  const label = action.charAt(0).toUpperCase() + action.slice(1);
  const variant: 'default' | 'muted' | 'destructive' | 'secondary' =
    action === 'delete'
      ? 'destructive'
      : action === 'create'
        ? 'default'
        : action === 'restore'
          ? 'secondary'
          : 'muted';
  return (
    <Badge variant={variant} data-action={action}>
      {label}
    </Badge>
  );
}

/**
 * Renders a `{ before, after }` diff — one row per changed key. The diff
 * payload is `unknown` on the wire (server-side JSON), so we defensively
 * shape it: keys are the union of `before` and `after`, each cell shown as
 * a pretty-printed string.
 */
function DiffTable({ diff }: { diff: unknown }) {
  const shaped = shapeDiff(diff);
  if (shaped === null || shaped.keys.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        No field-level diff was recorded for this update.
      </p>
    );
  }
  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-xs">
        <thead className="bg-muted text-muted-foreground">
          <tr>
            <th scope="col" className="p-2 text-left font-medium">Field</th>
            <th scope="col" className="p-2 text-left font-medium">Before</th>
            <th scope="col" className="p-2 text-left font-medium">After</th>
          </tr>
        </thead>
        <tbody>
          {shaped.keys.map((key) => (
            <tr key={key} className="border-t">
              <td className="p-2 font-medium">{key}</td>
              <td className="p-2 text-muted-foreground">
                {formatDiffValue(shaped.before[key])}
              </td>
              <td className="p-2">{formatDiffValue(shaped.after[key])}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function shapeDiff(
  diff: unknown,
): { keys: string[]; before: Record<string, unknown>; after: Record<string, unknown> } | null {
  if (typeof diff !== 'object' || diff === null) return null;
  const record = diff as { before?: unknown; after?: unknown };
  const before = isRecord(record.before) ? record.before : {};
  const after = isRecord(record.after) ? record.after : {};
  const keys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)]));
  return { keys, before, after };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function formatDiffValue(value: unknown): string {
  if (value === undefined || value === null) return '—';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    // `value` here is a non-primitive that failed to serialise (e.g. a circular
    // ref). Do NOT `String(value)` — it stringifies to `[object Object]`, which
    // is never useful. Show a placeholder instead.
    return '[unserialisable value]';
  }
}
