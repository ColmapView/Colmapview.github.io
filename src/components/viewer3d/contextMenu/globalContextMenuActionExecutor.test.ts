import { describe, expect, it, vi } from 'vitest';
import {
  CONTEXT_MENU_COORD_SYSTEMS,
  executeGlobalContextMenuAction,
  type GlobalContextMenuActionExecutorDeps,
} from './globalContextMenuActionExecutor';

function createDeps(
  overrides: Partial<GlobalContextMenuActionExecutorDeps> = {}
): GlobalContextMenuActionExecutorDeps {
  return {
    resetView: vi.fn(),
    setView: vi.fn(),
    fullscreen: {
      isFullscreen: vi.fn(() => false),
      enterFullscreen: vi.fn(),
      exitFullscreen: vi.fn(),
    },
    cameraProjection: 'perspective',
    setCameraProjection: vi.fn(),
    cameraMode: 'orbit',
    setCameraMode: vi.fn(),
    horizonLock: 'off',
    setHorizonLock: vi.fn(),
    autoRotateMode: 'off',
    setAutoRotateMode: vi.fn(),
    backgroundColor: '#ffffff',
    backgroundColors: { lightColor: '#ffffff', darkColor: '#101010' },
    setBackgroundColor: vi.fn(),
    toggleAxes: vi.fn(),
    toggleGalleryCollapsed: vi.fn(),
    axisLabelMode: 'off',
    setAxisLabelMode: vi.fn(),
    axesCoordinateSystem: 'colmap',
    setAxesCoordinateSystem: vi.fn(),
    frustumColorMode: 'single',
    setFrustumColorMode: vi.fn(),
    showPointCloud: false,
    setShowPointCloud: vi.fn(),
    colorMode: 'trackLength',
    setColorMode: vi.fn(),
    pointSize: 2,
    setPointSize: vi.fn(),
    minTrackLength: 2,
    setMinTrackLength: vi.fn(),
    cameraDisplayMode: 'frustum',
    setCameraDisplayMode: vi.fn(),
    showMatches: false,
    setShowMatches: vi.fn(),
    matchesDisplayMode: 'blink',
    setMatchesDisplayMode: vi.fn(),
    showSelectionHighlight: false,
    setShowSelectionHighlight: vi.fn(),
    selectionColorMode: 'rainbow',
    setSelectionColorMode: vi.fn(),
    setSelectedImageId: vi.fn(),
    showCameras: false,
    setShowCameras: vi.fn(),
    undistortionEnabled: true,
    setUndistortionEnabled: vi.fn(),
    toggleGizmo: vi.fn(),
    applyTransformPreset: vi.fn(),
    pickingMode: 'off',
    setPickingMode: vi.fn(),
    resetTransform: vi.fn(),
    applyTransformToData: vi.fn(),
    droppedFiles: null,
    confirmReload: vi.fn(() => true),
    processFiles: vi.fn(),
    takeScreenshot: vi.fn(),
    setExportFormat: vi.fn(),
    triggerExport: vi.fn(),
    pointerLock: false,
    setPointerLock: vi.fn(),
    flySpeed: 3,
    setFlySpeed: vi.fn(),
    openDeletionModal: vi.fn(),
    openFloorDetectionModal: vi.fn(),
    openCameraConversionModal: vi.fn(),
    openEditPopup: vi.fn(),
    ...overrides,
  };
}

describe('global context menu action executor', () => {
  it('executes view and fullscreen actions through explicit dependencies', async () => {
    const deps = createDeps();

    await executeGlobalContextMenuAction('resetView', deps);
    expect(deps.resetView).toHaveBeenCalled();
    expect(deps.setCameraProjection).toHaveBeenCalledWith('perspective');

    await executeGlobalContextMenuAction('viewPosY', deps);
    expect(deps.setView).toHaveBeenCalledWith('y');

    await executeGlobalContextMenuAction('toggleFullscreen', deps);
    expect(deps.fullscreen.enterFullscreen).toHaveBeenCalled();
    expect(deps.fullscreen.exitFullscreen).not.toHaveBeenCalled();

    const fullscreenDeps = createDeps({
      fullscreen: {
        isFullscreen: vi.fn(() => true),
        enterFullscreen: vi.fn(),
        exitFullscreen: vi.fn(),
      },
    });
    await executeGlobalContextMenuAction('toggleFullscreen', fullscreenDeps);
    expect(fullscreenDeps.fullscreen.exitFullscreen).toHaveBeenCalled();
  });

  it('cycles display, point, camera, and navigation state', async () => {
    const deps = createDeps({
      backgroundColor: '#ffffff',
      axesCoordinateSystem: CONTEXT_MENU_COORD_SYSTEMS[0],
      showMatches: false,
      matchesDisplayMode: 'blink',
      showCameras: false,
      cameraDisplayMode: 'arrow',
    });

    await executeGlobalContextMenuAction('toggleBackground', deps);
    expect(deps.setBackgroundColor).toHaveBeenCalledWith('#101010');

    await executeGlobalContextMenuAction('cycleCoordinateSystem', deps);
    expect(deps.setAxesCoordinateSystem).toHaveBeenCalledWith(CONTEXT_MENU_COORD_SYSTEMS[1]);

    await executeGlobalContextMenuAction('cyclePointColor', deps);
    expect(deps.setShowPointCloud).toHaveBeenCalledWith(true);
    expect(deps.setColorMode).toHaveBeenCalledWith('rgb');

    await executeGlobalContextMenuAction('cycleMatchesDisplay', deps);
    expect(deps.setShowMatches).toHaveBeenCalledWith(true);
    expect(deps.setMatchesDisplayMode).toHaveBeenCalledWith('static');

    await executeGlobalContextMenuAction('toggleImagePlanes', deps);
    expect(deps.setShowCameras).toHaveBeenCalledWith(true);
    expect(deps.setCameraDisplayMode).toHaveBeenCalledWith('frustum');

    await executeGlobalContextMenuAction('togglePointerLock', deps);
    expect(deps.setPointerLock).toHaveBeenCalledWith(true);

    await executeGlobalContextMenuAction('flySpeedDown', deps);
    expect(deps.setFlySpeed).toHaveBeenCalledWith(2);
  });

  it('executes transform and picking actions', async () => {
    const deps = createDeps({ pickingMode: 'distance-2pt' });

    await executeGlobalContextMenuAction('centerAtOrigin', deps);
    expect(deps.applyTransformPreset).toHaveBeenCalledWith('centerAtOrigin');

    await executeGlobalContextMenuAction('twoPointScale', deps);
    expect(deps.setPickingMode).toHaveBeenCalledWith('off');

    await executeGlobalContextMenuAction('applyTransform', deps);
    expect(deps.applyTransformToData).toHaveBeenCalled();
  });

  it('makes point display pickable before enabling transform picking from context menu', async () => {
    const hiddenDeps = createDeps({
      pickingMode: 'off',
      showPointCloud: false,
      colorMode: 'trackLength',
    });

    await executeGlobalContextMenuAction('onePointOrigin', hiddenDeps);
    expect(hiddenDeps.setShowPointCloud).toHaveBeenCalledWith(true);
    expect(hiddenDeps.setColorMode).toHaveBeenCalledWith('rgb');
    expect(hiddenDeps.setPickingMode).toHaveBeenCalledWith('origin-1pt');

    const splatOnlyDeps = createDeps({
      pickingMode: 'off',
      showPointCloud: true,
      colorMode: 'splats',
    });

    await executeGlobalContextMenuAction('threePointAlign', splatOnlyDeps);
    expect(splatOnlyDeps.setShowPointCloud).not.toHaveBeenCalled();
    expect(splatOnlyDeps.setColorMode).toHaveBeenCalledWith('splatPoints');
    expect(splatOnlyDeps.setPickingMode).toHaveBeenCalledWith('normal-3pt');
  });

  it('reloads dropped files only after confirmation', async () => {
    const files = new Map<string, File>();
    const deniedDeps = createDeps({
      droppedFiles: files,
      confirmReload: vi.fn(() => false),
    });

    await executeGlobalContextMenuAction('reloadData', deniedDeps);
    expect(deniedDeps.resetTransform).not.toHaveBeenCalled();
    expect(deniedDeps.processFiles).not.toHaveBeenCalled();

    const confirmedDeps = createDeps({
      droppedFiles: files,
      confirmReload: vi.fn(() => true),
    });
    await executeGlobalContextMenuAction('reloadData', confirmedDeps);
    expect(confirmedDeps.resetTransform).toHaveBeenCalled();
    expect(confirmedDeps.processFiles).toHaveBeenCalledWith(files);
  });

  it('executes export and tool modal actions', async () => {
    const deps = createDeps();

    await executeGlobalContextMenuAction('takeScreenshot', deps);
    expect(deps.takeScreenshot).toHaveBeenCalled();

    await executeGlobalContextMenuAction('exportPLY', deps);
    expect(deps.setExportFormat).toHaveBeenCalledWith('ply');
    expect(deps.triggerExport).toHaveBeenCalled();

    await executeGlobalContextMenuAction('openDeletion', deps);
    expect(deps.openDeletionModal).toHaveBeenCalled();

    await executeGlobalContextMenuAction('editMenu', deps);
    expect(deps.openEditPopup).toHaveBeenCalled();
  });
});
