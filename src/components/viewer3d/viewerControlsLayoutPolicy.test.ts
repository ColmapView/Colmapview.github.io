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
    expect(shouldShowMatchesPanel(false, 'frustum')).toBe(false);
    expect(shouldShowMatchesPanel(true, 'frustum')).toBe(true);
    expect(shouldShowMatchesPanel(true, 'arrow')).toBe(true);
    expect(shouldShowMatchesPanel(true, 'imageplane')).toBe(false);
  });
});
