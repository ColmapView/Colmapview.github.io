import { describe, expect, it } from 'vitest';
import {
  getViewerControlsContainerClassName,
  shouldShowCameraDependentPanels,
  shouldShowMatchesPanel,
} from './viewerControlsLayoutPolicy';

describe('viewer controls layout policy', () => {
  it('builds container classes from UI mode flags', () => {
    expect(getViewerControlsContainerClassName({
      baseClassName: 'controls',
      autoHideButtons: false,
      touchMode: false,
    })).toBe('controls');

    expect(getViewerControlsContainerClassName({
      baseClassName: 'controls',
      autoHideButtons: true,
      touchMode: true,
    })).toBe('controls idle-hideable touch-control-panel');
  });

  it('hides camera-dependent panels when cameras are hidden', () => {
    expect(shouldShowCameraDependentPanels(false)).toBe(false);
    expect(shouldShowCameraDependentPanels(true)).toBe(true);
  });

  it('hides matches controls while image planes own the camera display', () => {
    expect(shouldShowMatchesPanel(false, 'frustum', true)).toBe(false);
    expect(shouldShowMatchesPanel(true, 'frustum', true)).toBe(true);
    expect(shouldShowMatchesPanel(true, 'arrow', true)).toBe(true);
    expect(shouldShowMatchesPanel(true, 'imageplane', true)).toBe(false);
  });

  it('keeps matches controls visible under image-plane mode for spherical-only datasets', () => {
    // Spherical-only (no pinhole cameras): image planes do not exist, so a persisted
    // imageplane mode must not hide the Matches panel (no in-panel escape otherwise).
    expect(shouldShowMatchesPanel(true, 'imageplane', false)).toBe(true);
    expect(shouldShowMatchesPanel(true, 'frustum', false)).toBe(true);
    expect(shouldShowMatchesPanel(true, 'arrow', false)).toBe(true);
    // Hidden cameras still hide the panel regardless of camera family.
    expect(shouldShowMatchesPanel(false, 'imageplane', false)).toBe(false);
  });
});
