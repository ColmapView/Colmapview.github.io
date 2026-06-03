import { describe, expect, it, vi } from 'vitest';
import type { CameraViewState } from '../store/types';
import { getControlsViewState } from './urlStateControlsPolicy';

const viewState: CameraViewState = {
  position: [1, 2, 3],
  quaternion: [0, 0, 0, 1],
  target: [0, 0, 0],
  distance: 5,
};

describe('urlStateControlsPolicy', () => {
  it('reads the current view state from compatible controls', () => {
    const getCurrentViewState = vi.fn(() => viewState);

    expect(getControlsViewState({ getCurrentViewState })).toBe(viewState);
    expect(getCurrentViewState).toHaveBeenCalledTimes(1);
  });

  it('returns null for missing or malformed controls', () => {
    expect(getControlsViewState(null)).toBeNull();
    expect(getControlsViewState({})).toBeNull();
    expect(getControlsViewState({ getCurrentViewState: viewState })).toBeNull();
  });
});
