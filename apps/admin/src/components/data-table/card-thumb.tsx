import * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * The grid-view thumbnail — a big image you can actually judge, as opposed to
 * the 32/40px one in a table cell. Shared by every `renderCard` so the six lists
 * cannot drift.
 *
 * Seeded rows carry URLs never uploaded through us; they are shown, never
 * rejected on read. A broken/missing image degrades to a neutral placeholder.
 *
 * `aspect` is a Tailwind aspect class: portrait for wallpapers/status (the
 * phone-shaped media), `aspect-square` for audio artwork.
 */
export function CardThumb({
  src,
  title,
  aspect = 'aspect-[3/4]',
}: {
  src: string | null | undefined;
  title: string;
  aspect?: string;
}) {
  const [broken, setBroken] = React.useState(false);
  if (!src || broken) {
    return (
      <div
        title={title}
        className={cn(
          'flex items-center justify-center rounded-md border bg-muted p-2 text-center text-xs text-muted-foreground',
          aspect,
        )}
      >
        No thumbnail
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={title}
      title={title}
      loading="lazy"
      className={cn('w-full rounded-md border bg-muted object-cover', aspect)}
      onError={() => setBroken(true)}
    />
  );
}

/**
 * The moving counterpart to `CardThumb` — a grid card whose row IS a video plays
 * it in place, because a still cannot tell you whether a loop is right. Same box,
 * same `aspect`, so a mixed grid stays aligned.
 *
 * `preload="metadata"` keeps a page of cards from pulling a page of videos, and
 * the poster is the row's own thumbnail so the card looks identical until played.
 * A dead/blocked source degrades to that poster via `<CardThumb>`.
 */
export function CardVideo({
  src,
  poster,
  title,
  aspect = 'aspect-[3/4]',
}: {
  src: string;
  poster: string | null | undefined;
  title: string;
  aspect?: string;
}) {
  const [broken, setBroken] = React.useState(false);
  if (broken) return <CardThumb src={poster} title={title} aspect={aspect} />;
  return (
    <video
      src={src}
      poster={poster ?? undefined}
      title={title}
      controls
      playsInline
      preload="metadata"
      className={cn('w-full rounded-md border bg-muted object-cover', aspect)}
      onError={() => setBroken(true)}
    />
  );
}
