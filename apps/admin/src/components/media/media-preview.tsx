import { cn } from '@/lib/utils';
import type { MediaClass } from './media-constraints';

/**
 * Per-class preview of an already-uploaded (or existing) media URL, chosen by
 * the field's media class (AC (a) step 5):
 *
 *   image → `<img>`   ·   audio → `<audio controls>`   ·   video → `<video controls>`
 *
 * The URL is a PUBLIC CDN url by design (epic Scope Decision 4 / risk A-R1) —
 * everything uploaded is world-readable, so nothing here implies privacy.
 */
export function MediaPreview({
  url,
  mediaClass,
  className,
}: {
  url: string;
  mediaClass: MediaClass;
  className?: string;
}) {
  switch (mediaClass) {
    case 'audio':
      return (
        <audio
          data-slot="media-preview"
          controls
          preload="metadata"
          src={url}
          className={cn('w-full', className)}
        >
          Your browser does not support audio playback.
        </audio>
      );

    case 'video':
      return (
        <video
          data-slot="media-preview"
          controls
          preload="metadata"
          src={url}
          className={cn(
            'max-h-64 w-full rounded-md border bg-muted object-contain',
            className,
          )}
        >
          Your browser does not support video playback.
        </video>
      );

    case 'image':
    default:
      return (
        <img
          data-slot="media-preview"
          src={url}
          alt="Uploaded preview"
          className={cn(
            'max-h-64 w-auto rounded-md border bg-muted object-contain',
            className,
          )}
        />
      );
  }
}
