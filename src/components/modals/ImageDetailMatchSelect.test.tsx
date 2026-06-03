import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ImageDetailMatchSelect } from './ImageDetailMatchSelect';

afterEach(() => {
  cleanup();
});

describe('ImageDetailMatchSelect', () => {
  it('renders touch options and routes selected image ids', () => {
    const setMatchedImageId = vi.fn();

    render(
      <ImageDetailMatchSelect
        variant="touch"
        matchedImageId={8}
        connectedImages={[
          { imageId: 8, matchCount: 4, name: 'match-a.jpg' },
          { imageId: 9, matchCount: 2, name: 'match-b.jpg' },
        ]}
        setMatchedImageId={setMatchedImageId}
      />
    );

    const select = screen.getByRole('combobox');
    expect(select).toHaveValue('8');
    expect(select).toHaveStyle({ minHeight: '36px' });
    expect(screen.getByRole('option', { name: 'Select image...' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'match-a.jpg (4)' })).toBeInTheDocument();

    fireEvent.change(select, { target: { value: '9' } });
    expect(setMatchedImageId).toHaveBeenCalledWith(9);
  });

  it('renders desktop labels and routes placeholder selection to null', () => {
    const setMatchedImageId = vi.fn();
    const onWheel = vi.fn();

    render(
      <ImageDetailMatchSelect
        variant="desktop"
        matchedImageId={9}
        connectedImages={[
          { imageId: 9, matchCount: 2, name: 'match-b.jpg' },
        ]}
        setMatchedImageId={setMatchedImageId}
        onWheel={onWheel}
      />
    );

    const select = screen.getByRole('combobox');
    expect(select).toHaveValue('9');
    expect(screen.getByRole('option', { name: 'Select connected image...' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'match-b.jpg (2 matches)' })).toBeInTheDocument();

    fireEvent.wheel(select);
    expect(onWheel).toHaveBeenCalledOnce();

    fireEvent.change(select, { target: { value: '' } });
    expect(setMatchedImageId).toHaveBeenCalledWith(null);
  });
});
