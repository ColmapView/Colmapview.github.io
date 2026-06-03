import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ImageDetailImageJumpInput } from './ImageDetailImageJumpInput';

afterEach(() => {
  cleanup();
});

describe('ImageDetailImageJumpInput', () => {
  it('opens an existing image id on Enter and ignores missing image ids', () => {
    const onOpenImageId = vi.fn();

    render(
      <ImageDetailImageJumpInput
        imageDetailId={7}
        imageCount={12}
        onOpenImageId={onOpenImageId}
        imageExists={(imageId) => imageId === 9}
      />
    );

    const input = screen.getByDisplayValue('7');
    fireEvent.change(input, { target: { value: '9' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onOpenImageId).toHaveBeenCalledWith(9);

    fireEvent.change(input, { target: { value: '99' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onOpenImageId).toHaveBeenCalledTimes(1);
  });

  it('resets edited values on Escape and blur', () => {
    render(
      <ImageDetailImageJumpInput
        imageDetailId={7}
        imageCount={12}
        onOpenImageId={vi.fn()}
        imageExists={() => true}
      />
    );

    const input = screen.getByDisplayValue('7');

    fireEvent.change(input, { target: { value: '10' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(input).toHaveValue('7');

    fireEvent.change(input, { target: { value: '11' } });
    fireEvent.blur(input);
    expect(input).toHaveValue('7');

    expect(screen.getByText('12')).toBeVisible();
  });
});
