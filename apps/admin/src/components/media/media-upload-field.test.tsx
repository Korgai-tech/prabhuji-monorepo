import { fireEvent, render, screen } from '@testing-library/react';
import { expect, test, vi } from 'vitest';

// The presign call must NEVER fire for a client-rejected pick.
const { post } = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock('@/lib/api', () => ({ api: { POST: post } }));

import { MediaUploadField } from './media-upload-field';
import {
  constraintForAccept,
  mediaClassForContentType,
  resolveMediaConstraint,
} from './media-constraints';

const noop = () => undefined;

function renderField(props?: Partial<Parameters<typeof MediaUploadField>[0]>) {
  return render(
    <>
      <label htmlFor="f">Audio</label>
      <MediaUploadField
        id="f"
        name="audioUrl"
        value=""
        onChange={props?.onChange ?? noop}
        disabled={false}
        invalid={false}
        describedBy={undefined}
        values={{}}
        module="aarti"
        entity="audioItem"
        field="audioStreamUrl"
        {...props}
      />
    </>,
  );
}

test('constraint helpers map content-types to class + cap', () => {
  expect(mediaClassForContentType('audio/mpeg')).toBe('audio');
  expect(mediaClassForContentType('image/png')).toBe('image');
  expect(mediaClassForContentType('application/pdf')).toBeUndefined();

  expect(constraintForAccept(['video/mp4']).maxBytes).toBe(200 * 1024 * 1024);
  expect(resolveMediaConstraint({ module: 'aarti', entity: 'audioItem', field: 'audioStreamUrl' }).mediaClass).toBe('audio');
});

test('a wrong-type pick shows a field error and NEVER presigns', () => {
  const onChange = vi.fn();
  renderField({ onChange });

  const input = screen.getByLabelText('Audio');
  const wrong = new File(['x'], 'note.txt', { type: 'text/plain' });
  fireEvent.change(input, { target: { files: [wrong] } });

  expect(screen.getByRole('alert')).toBeTruthy();
  expect(post).not.toHaveBeenCalled();
  expect(onChange).not.toHaveBeenCalled();
});

test('an existing value renders a preview and offers replace', () => {
  renderField({ value: 'https://cdn.example.com/aarti/audio/abc.mp3' });
  expect(screen.getByText('Replace file')).toBeTruthy();
});
