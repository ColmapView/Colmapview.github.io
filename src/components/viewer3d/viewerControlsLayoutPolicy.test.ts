import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  TOOLBAR_GROUP_CLASS,
  TOOLBAR_GROUP_LABELS,
  getViewerControlsContainerClassName,
  shouldShowCameraDependentPanels,
  shouldShowMatchesPanel,
} from './viewerControlsLayoutPolicy';
import type { CameraUiContext } from './cameraUiContext';

const regular: CameraUiContext = { hasPinholeCameras: true, hasSphericalCameras: false, selectedCameraFamily: null };
const spherical: CameraUiContext = { hasPinholeCameras: false, hasSphericalCameras: true, selectedCameraFamily: null };

describe('viewer controls layout policy', () => {
  it('names the four toolbar clusters the dividers separate', () => {
    expect(TOOLBAR_GROUP_LABELS).toEqual({
      view: 'View',
      data: 'Data',
      capture: 'Capture',
      app: 'App',
    });
  });

  it('keeps the group wrappers box-less so the column gap still spaces buttons', () => {
    // display:contents, not a nested flex column: index.css retunes the gap on
    // the CONTAINER at <=1520px and in touch mode, and a wrapper that generated
    // a box would keep its own gap-2 there.
    expect(TOOLBAR_GROUP_CLASS).toBe('contents');
    const css = readFileSync(resolve(__dirname, '../../index.css'), 'utf8');
    expect(css).toContain(`.${TOOLBAR_GROUP_CLASS} { display: contents; }`);
  });

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
    expect(shouldShowMatchesPanel(false, 'frustum', regular)).toBe(false);
    expect(shouldShowMatchesPanel(true, 'frustum', regular)).toBe(true);
    expect(shouldShowMatchesPanel(true, 'arrow', regular)).toBe(true);
    expect(shouldShowMatchesPanel(true, 'imageplane', regular)).toBe(false);
  });

  it('keeps matches controls visible under image-plane mode for spherical-only datasets', () => {
    // Spherical-only (no pinhole cameras): image planes do not exist, so a persisted
    // imageplane mode must not hide the Matches panel (no in-panel escape otherwise).
    expect(shouldShowMatchesPanel(true, 'imageplane', spherical)).toBe(true);
    expect(shouldShowMatchesPanel(true, 'frustum', spherical)).toBe(true);
    expect(shouldShowMatchesPanel(true, 'arrow', spherical)).toBe(true);
    // Hidden cameras still hide the panel regardless of camera family.
    expect(shouldShowMatchesPanel(false, 'imageplane', spherical)).toBe(false);
  });

  it('keeps mixed-dataset matches accessible until a regular image is selected in Image Plane mode', () => {
    const mixed = { ...regular, hasSphericalCameras: true };
    expect(shouldShowMatchesPanel(true, 'imageplane', mixed)).toBe(true);
    expect(shouldShowMatchesPanel(true, 'imageplane', { ...mixed, selectedCameraFamily: 'spherical' })).toBe(true);
    expect(shouldShowMatchesPanel(true, 'imageplane', { ...mixed, selectedCameraFamily: 'pinhole' })).toBe(false);
    expect(shouldShowMatchesPanel(false, 'imageplane', { ...mixed, selectedCameraFamily: 'spherical' })).toBe(false);
  });
});
