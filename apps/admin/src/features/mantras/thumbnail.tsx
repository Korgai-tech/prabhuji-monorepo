import * as React from 'react';

/**
 * A small image thumbnail for a list cell. Seeded rows carry URLs never uploaded
 * through us (e.g. SoundHelix/picsum) — they are shown, never rejected on read
 * (mirrors the taxonomy exemplar's `DeityIcon`). A broken/missing image degrades
 * to a neutral placeholder.
 */
export function Thumbnail({ src }: { src: string | null | undefined }) {
  const [broken, setBroken] = React.useState(false);
  if (!src || broken) {
    return (
      <div
        aria-hidden="true"
        className="size-8 rounded-md border bg-muted"
        title="No image"
      />
    );
  }
  return (
    <img
      src={src}
      alt=""
      className="size-8 rounded-md border object-cover"
      onError={() => setBroken(true)}
    />
  );
}
