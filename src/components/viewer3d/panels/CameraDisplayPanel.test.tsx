import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CameraDisplayPanel, type CameraDisplayPanelProps } from './CameraDisplayPanel';

afterEach(() => {
  cleanup();
});

function renderPanel(overrides: Partial<CameraDisplayPanelProps> = {}) {
  const props: CameraDisplayPanelProps = {
    activePanel: 'scale',
    setActivePanel: vi.fn(),
    showCameras: true,
    setShowCameras: vi.fn(),
    cameraDisplayMode: 'frustum',
    setCameraDisplayMode: vi.fn(),
    frustumColorMode: 'byCamera',
    setFrustumColorMode: vi.fn(),
    hasRigData: false,
    cameraContext: { hasPinholeCameras: true, hasSphericalCameras: false, selectedCameraFamily: null },
    frustumSingleColor: '#ff0000',
    onFrustumColorPickerChange: vi.fn(),
    frustumHsl: { h: 0, s: 100, l: 50 },
    onFrustumHueChange: vi.fn(),
    onFrustumSaturationChange: vi.fn(),
    onFrustumLightnessChange: vi.fn(),
    cameraScaleFactor: '1',
    setCameraScaleFactor: vi.fn(),
    cameraScale: 0.1,
    setCameraScale: vi.fn(),
    frustumStandbyOpacity: 0.5,
    setFrustumStandbyOpacity: vi.fn(),
    frustumLineWidth: 2,
    setFrustumLineWidth: vi.fn(),
    selectionPlaneOpacity: 0.4,
    setSelectionPlaneOpacity: vi.fn(),
    unselectedCameraOpacity: 0.6,
    setUnselectedCameraOpacity: vi.fn(),
    undistortionEnabled: false,
    setUndistortionEnabled: vi.fn(),
    autoFovEnabled: true,
    setAutoFovEnabled: vi.fn(),
    splatMetricVisualizationsAvailable: false,
    onCycleCameraDisplayMode: vi.fn(),
    ...overrides,
  };

  return { ...render(<CameraDisplayPanel {...props} />), props };
}

describe('CameraDisplayPanel spherical-only controls', () => {
  it('keeps the Mode and Selection α rows when pinhole cameras are present', () => {
    renderPanel();

    expect(screen.queryByText('Mode')).not.toBeNull();
    expect(screen.queryByText('Selection α')).not.toBeNull();
  });

  it('hides only the Mode row for spherical-only datasets — Selection α stays (the panorama lens consumes it)', () => {
    renderPanel({ cameraContext: { hasPinholeCameras: false, hasSphericalCameras: true, selectedCameraFamily: null } });

    expect(screen.queryByText('Mode')).toBeNull();
    expect(screen.queryByText('Selection α')).not.toBeNull();
  });

  it('keeps other camera controls visible for spherical-only datasets', () => {
    renderPanel({ cameraContext: { hasPinholeCameras: false, hasSphericalCameras: true, selectedCameraFamily: null } });

    // Rows unrelated to the pinhole-only no-ops remain present.
    expect(screen.queryByText('Show Cameras')).not.toBeNull();
    expect(screen.queryByText('Line Width')).not.toBeNull();
    expect(screen.queryByText('Standby α')).not.toBeNull();
    expect(screen.queryByText('Unselected α')).not.toBeNull();
  });

  it('scopes mixed display modes to regular cameras and adapts the preview label without changing its setting', () => {
    const onPreviewChange = vi.fn();
    const { rerender, props } = renderPanel({
      cameraContext: { hasPinholeCameras: true, hasSphericalCameras: true, selectedCameraFamily: null },
      undistortionEnabled: true,
      setUndistortionEnabled: onPreviewChange,
    });
    expect(screen.getByText('Regular camera display')).toBeInTheDocument();
    expect(screen.getByText('Panoramas stay spherical.')).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Image preview (U)' })).toHaveAttribute('aria-checked', 'true');

    for (const [family, label] of [['spherical', 'Panorama view (U)'], ['pinhole', 'Lens undistortion (U)']] as const) {
      rerender(<CameraDisplayPanel {...props} cameraContext={{ ...props.cameraContext, selectedCameraFamily: family }} />);
      expect(screen.getByRole('switch', { name: label })).toHaveAttribute('aria-checked', 'true');
      expect(onPreviewChange).not.toHaveBeenCalled();
    }
    fireEvent.click(screen.getByRole('switch', { name: 'Lens undistortion (U)' }));
    expect(onPreviewChange).toHaveBeenCalledExactlyOnceWith(false);
  });

  it('describes panorama controls accurately even with a saved Image Plane setting', () => {
    renderPanel({
      cameraContext: { hasPinholeCameras: false, hasSphericalCameras: true, selectedCameraFamily: null },
      cameraDisplayMode: 'imageplane',
    });
    expect(screen.getByRole('button', { name: 'Panorama cameras (F)' })).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Panorama view (U)' })).toBeInTheDocument();
    expect(screen.getByText('Panoramas:')).toBeInTheDocument();
    expect(screen.queryByText('Image Plane:')).not.toBeInTheDocument();
  });
});
