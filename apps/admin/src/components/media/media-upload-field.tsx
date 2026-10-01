import * as React from 'react';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import type { EntityFormFieldRenderProps } from '@/components/entity-form/entity-form';

import { MediaPreview } from './media-preview';
import { useMediaUpload } from './use-media-upload';
import {
  formatAccept,
  formatMaxSize,
  resolveMediaConstraint,
  type MediaConstraint,
} from './media-constraints';

/**
 * ════════════════════════════════════════════════════════════════════════════
 *  <MediaUploadField> — pick → presign → direct S3 PUT (with progress) → preview
 * ════════════════════════════════════════════════════════════════════════════
 *
 * The ONE place in `apps/admin` that turns a file into a stored URL. It is a
 * `type: 'custom'` field of `<EntityForm>` (TAM-86): it holds a URL, not a file.
 *
 *  - It reports `publicUrl` to the form via `onChange` **only after the PUT
 *    succeeds**. Until then the field value stays empty, so the form's Zod
 *    mirror (a required URL) blocks submit — the "submitted before the upload
 *    finished" guard, with NO change to `<EntityForm>` (§(c), §#EXPORT_CRITICAL).
 *    For a heavy video/audio upload the server optimises (TAM-267, presign
 *    `processing: true`) "succeeds" means the optimised FINAL file exists: the
 *    field shows "Optimising…" between the PUT and that moment.
 *  - The client type/size check is FAST FEEDBACK only; the server (at presign)
 *    and S3 (signed `Content-Type`/`Content-Length`) are the enforcement points.
 *  - REPLACE = pick a new file → new presign → new key → `onChange(newUrl)`. The
 *    old object is orphaned by design (A-R3). This component NEVER deletes.
 *
 * ── USAGE (in an <EntityForm> field config) ──────────────────────────────────
 * ```tsx
 * {
 *   name: 'iconUrl', label: 'Icon', type: 'custom', required: true,
 *   render: mediaField({ module: 'deity', entity: 'deity', field: 'iconUrl' }),
 * }
 * ```
 * (`accept` is optional — resolved from the TAM-84 mirror in media-constraints.ts
 * by the (module, entity, field) triple; pass it to override.)
 */

export interface MediaUploadFieldProps extends EntityFormFieldRenderProps {
  /** The presign triple — sent verbatim to `POST /admin/media/presign`. */
  module: string;
  entity: string;
  field: string;
  /**
   * The allowed content-types (mirror of this field's server allowlist). If
   * omitted, resolved from the (module, entity, field) registry.
   */
  accept?: readonly string[];
}

export function MediaUploadField({
  id,
  value,
  onChange,
  disabled,
  invalid,
  describedBy,
  module,
  entity,
  field,
  accept,
}: MediaUploadFieldProps) {
  // Resolving the constraint can throw for an unregistered field with no
  // `accept` — that is a wiring bug the developer must see, so let it surface.
  const constraint: MediaConstraint = React.useMemo(
    () => resolveMediaConstraint({ module, entity, field, accept }),
    [module, entity, field, accept],
  );

  const { state, upload, reset } = useMediaUpload();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [clientError, setClientError] = React.useState<string | undefined>();
  const [lastFile, setLastFile] = React.useState<File | undefined>();

  const currentUrl = typeof value === 'string' && value.length > 0 ? value : undefined;
  const errorMessageText = clientError ?? (state.status === 'error' ? state.error : undefined);
  const errorId = `${id}-error`;
  const describedByWithError = [describedBy, errorMessageText ? errorId : undefined]
    .filter(Boolean)
    .join(' ') || undefined;

  /** The client pre-check — fast feedback only, NEVER the enforcement point. */
  function precheck(file: File): string | undefined {
    if (!constraint.accept.includes(file.type)) {
      return `${formatAccept(constraint.accept)} only. That file is “${file.type || 'unknown type'}”.`;
    }
    if (file.size > constraint.maxBytes) {
      return `Too large — max ${formatMaxSize(constraint.maxBytes)}.`;
    }
    return undefined;
  }

  async function runUpload(file: File) {
    setClientError(undefined);
    setLastFile(file);
    try {
      // Presign with file.type and PUT with the SAME value — one source, used
      // twice (§(b)). onChange fires ONLY after the PUT resolves.
      const publicUrl = await upload({
        module,
        entity,
        field,
        file,
        contentType: file.type,
      });
      onChange(publicUrl);
    } catch {
      // The hook has already set `state.error`; the value stays empty so submit
      // remains blocked. The picked file is kept for retry.
    }
  }

  function handlePick(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Allow re-picking the same file later (onchange won't fire otherwise).
    event.target.value = '';
    if (!file) return;

    const problem = precheck(file);
    if (problem) {
      // Fast-feedback reject: NO presign, NO PUT. Retryable — file not lost.
      setClientError(problem);
      reset();
      return;
    }
    void runUpload(file);
  }

  const isUploading = state.status === 'uploading';
  // TAM-267: the bytes are up, the server is compressing them into the final
  // file. The value is still empty (submit stays blocked) until it is ready.
  const isProcessing = state.status === 'processing';
  const busy = disabled || isUploading || isProcessing;

  return (
    <div data-slot="media-upload-field" className="grid gap-3">
      {/* Hidden native input; a labelled button triggers it so the control
          stays keyboard-accessible and matches our button styling. */}
      <input
        ref={inputRef}
        id={id}
        type="file"
        accept={constraint.accept.join(',')}
        disabled={busy}
        aria-invalid={invalid || errorMessageText !== undefined || undefined}
        aria-describedby={describedByWithError}
        className="sr-only"
        onChange={handlePick}
      />

      <div className="flex items-center gap-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          {currentUrl ? 'Replace file' : 'Choose file'}
        </Button>
        <span className="text-xs text-muted-foreground">
          {formatAccept(constraint.accept)} · max {formatMaxSize(constraint.maxBytes)}
        </span>
      </div>

      {isUploading && (
        <div className="grid gap-1">
          <div
            role="progressbar"
            aria-valuenow={state.progress}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Upload progress"
            className="h-2 w-full overflow-hidden rounded-full bg-muted"
          >
            <div
              className="h-full bg-primary transition-[width]"
              style={{ width: `${state.progress}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground" aria-live="polite">
            Uploading… {state.progress}%
          </p>
        </div>
      )}

      {isProcessing && (
        <div className="grid gap-1" role="status" aria-live="polite">
          <div
            role="progressbar"
            aria-label="Optimising"
            aria-busy="true"
            className="h-2 w-full overflow-hidden rounded-full bg-muted"
          >
            <div className="h-full w-full animate-pulse bg-primary/60" />
          </div>
          <p className="text-xs text-muted-foreground">
            Optimising… large videos can take a minute. Keep this page open.
          </p>
        </div>
      )}

      {currentUrl && !isUploading && !isProcessing && (
        <MediaPreview url={currentUrl} mediaClass={constraint.mediaClass} />
      )}

      {errorMessageText && (
        <div className="grid gap-2">
          <p
            id={errorId}
            role="alert"
            className={cn('text-sm font-medium text-destructive')}
          >
            {errorMessageText}
          </p>
          {lastFile && state.status === 'error' && (
            <div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => void runUpload(lastFile)}
              >
                Retry upload
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Adapter for an `<EntityForm>` `type: 'custom'` field's `render`. Binds the
 * presign triple (and optional `accept`) and forwards the a11y render props.
 *
 * ```tsx
 * { name: 'audioUrl', label: 'Audio', type: 'custom', required: true,
 *   render: mediaField({ module: 'aarti', entity: 'audioItem', field: 'audioStreamUrl' }) }
 * ```
 */
export function mediaField(config: {
  module: string;
  entity: string;
  field: string;
  accept?: readonly string[];
}) {
  return function renderMediaField(props: EntityFormFieldRenderProps) {
    return <MediaUploadField {...props} {...config} />;
  };
}
