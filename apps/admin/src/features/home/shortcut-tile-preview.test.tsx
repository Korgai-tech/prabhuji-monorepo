import { render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';

import { ShortcutTilePreview } from './shortcut-tile-preview';

/**
 * The preview exists so ops can judge a palette without shipping it, so what
 * matters here is that it agrees with the phone: the same all-or-nothing rule,
 * the same inheritance, and — the one that bites — the same treatment of a stop
 * authored outside 0..1.
 */

const RENDER_PROPS = {
  id: 'preview',
  name: 'gradient_v1_preview',
  value: '',
  onChange: () => undefined,
  disabled: false,
  invalid: false,
  describedBy: undefined,
};

function renderPreview(values: Record<string, unknown>) {
  return render(<ShortcutTilePreview {...RENDER_PROPS} values={values} />);
}

const FULL_PALETTE = {
  label: 'Set Status',
  iconUrl: 'https://cdn.example.com/base/set_status.png',
  gradient_v1_label: 'स्टेटस लगाएं',
  gradient_v1_iconUrl: 'https://cdn.example.com/gradient_v1/set_status.png',
  gradient_v1_themeBackgroundFrom: '#EAF4FF',
  gradient_v1_themeBackgroundFromStop: '0.1',
  gradient_v1_themeBackgroundTo: '#3896E9',
  gradient_v1_themeBackgroundToStop: '1',
  gradient_v1_themeLabelColor: '#1261A8',
};

test('a fully themed arm paints the gradient and the label colour', () => {
  renderPreview(FULL_PALETTE);

  const tile = screen.getByRole('img', { name: /preview of the new colour design tile/i });
  // jsdom normalizes hex to `rgb()` when it reparses the style, so assert on
  // the normalized form rather than on the string we wrote.
  expect(tile.style.background).toContain('rgb(234, 244, 255) 10%');
  expect(tile.style.background).toContain('rgb(56, 150, 233) 100%');
  expect(tile.style.color).toBe('');
  expect(screen.getByText('स्टेटस लगाएं').style.color).toBe('rgb(18, 97, 168)');
});

/**
 * `set_wallpaper` is authored `0.14734 → 1.4734`. Flutter carries the
 * out-of-range handle as an `Alignment` below the card; CSS carries it as a
 * >100% colour stop. Clamping it in the preview would make the preview
 * disagree with the app on the one tile that most needs previewing.
 */
test('a stop above 1 is previewed unclamped', () => {
  renderPreview({
    ...FULL_PALETTE,
    gradient_v1_themeBackgroundFromStop: '0.14734',
    gradient_v1_themeBackgroundToStop: '1.4734',
  });

  const tile = screen.getByRole('img', { name: /preview of the new colour design tile/i });
  expect(tile.style.background).toContain('14.734%');
  expect(tile.style.background).toContain('147.34%');
});

/**
 * The server publishes `theme: null` unless all five columns are set, and the
 * admin write path enforces the same. A preview that painted three-fifths of a
 * palette would show a tile the phone will never render.
 */
test('a half-set palette previews nothing and says why', () => {
  renderPreview({ ...FULL_PALETTE, gradient_v1_themeLabelColor: '' });

  expect(screen.queryByRole('img', { name: /preview of the new colour design tile/i })).toBeNull();
  expect(screen.getByText(/fill all five .New colour design. palette fields/i)).toBeTruthy();
});

test('a malformed hex previews nothing rather than a broken tile', () => {
  renderPreview({ ...FULL_PALETTE, gradient_v1_themeBackgroundFrom: '#GGGGGG' });

  expect(screen.queryByRole('img', { name: /preview of the new colour design tile/i })).toBeNull();
});

/**
 * A blank arm field means INHERIT, which is the commonest correct setup: ops
 * themes an arm and leaves its copy and artwork to the base row.
 */
test('a blank arm label and icon inherit the base row', () => {
  renderPreview({
    ...FULL_PALETTE,
    gradient_v1_label: '',
    gradient_v1_iconUrl: '',
  });

  expect(screen.getByText('Set Status')).toBeTruthy();
  expect(screen.getByRole('presentation').getAttribute('src')).toBe(
    'https://cdn.example.com/base/set_status.png',
  );
});

test("the arm's own artwork wins over the base row's", () => {
  renderPreview(FULL_PALETTE);

  expect(screen.getByRole('presentation').getAttribute('src')).toBe(
    'https://cdn.example.com/gradient_v1/set_status.png',
  );
});

/**
 * Every icon on the grid is currently unset — the seed deliberately publishes
 * no artwork and ops uploads it post-deploy — so "no icon anywhere" is the
 * state the form opens in, and it must read as a prompt, not as a broken image.
 */
test('no artwork on either the arm or the base row shows no image at all', () => {
  renderPreview({
    ...FULL_PALETTE,
    iconUrl: '',
    gradient_v1_iconUrl: '',
  });

  expect(screen.queryByRole('presentation')).toBeNull();
  expect(screen.getByText(/no artwork yet/i)).toBeTruthy();
});
