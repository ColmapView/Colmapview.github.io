import { describe, expect, it } from 'vitest';
import {
  mergePointCloudPersistedState,
  migrateCameraPersistedState,
  migrateRigPersistedState,
  migrateUIPersistedState,
} from './persistedStoreMigrations';
import { usePointCloudStore } from './stores/pointCloudStore';

describe('persistedStoreMigrations', () => {
  describe('mergePointCloudPersistedState', () => {
    it('restores persisted point-cloud settings and maps legacy splats to color mode', () => {
      const currentState = usePointCloudStore.getState();

      const merged = mergePointCloudPersistedState(
        {
          showPointCloud: false,
          showSplats: true,
          pointSize: 7,
          pointOpacity: 0.4,
          colorMode: 'trackLength',
          minTrackLength: 5,
          maxReprojectionError: null,
          thinning: 3,
        },
        currentState
      );

      expect(merged).toMatchObject({
        showPointCloud: true,
        showSplats: true,
        pointSize: 7,
        pointOpacity: 0.4,
        colorMode: 'splats',
        minTrackLength: 5,
        maxReprojectionError: Infinity,
        thinning: 3,
      });
      expect(merged.setPointSize).toBe(currentState.setPointSize);
    });

    it('ignores malformed persisted point-cloud values and keeps current settings', () => {
      const currentState = usePointCloudStore.getState();

      const merged = mergePointCloudPersistedState(
        {
          showPointCloud: 'false',
          showSplats: 'true',
          pointSize: 'large',
          pointOpacity: {},
          colorMode: 'bad',
          minTrackLength: null,
          maxReprojectionError: 'none',
          thinning: false,
        },
        currentState
      );

      expect(merged).toMatchObject({
        showPointCloud: currentState.showPointCloud,
        showSplats: currentState.showSplats,
        pointSize: currentState.pointSize,
        pointOpacity: currentState.pointOpacity,
        colorMode: currentState.colorMode,
        minTrackLength: currentState.minTrackLength,
        maxReprojectionError: currentState.maxReprojectionError,
        thinning: currentState.thinning,
      });
    });

    it('restores splat point overlay modes as splat-visible point-cloud modes', () => {
      const currentState = usePointCloudStore.getState();

      const merged = mergePointCloudPersistedState(
        {
          colorMode: 'splatRainbowPoints',
        },
        currentState
      );

      expect(merged).toMatchObject({
        showSplats: true,
        colorMode: 'splatRainbowPoints',
      });
    });
  });

  describe('migrateCameraPersistedState', () => {
    it('converts hidden camera display mode into the showCameras flag', () => {
      expect(migrateCameraPersistedState({ cameraDisplayMode: 'off' }, 0)).toMatchObject({
        showCameras: false,
        cameraDisplayMode: 'frustum',
      });
    });

    it('normalizes stale camera display modes while keeping cameras visible', () => {
      expect(migrateCameraPersistedState({ cameraDisplayMode: 'imagePlane' }, 0)).toMatchObject({
        showCameras: true,
        cameraDisplayMode: 'frustum',
      });
    });

    it('preserves explicit legacy camera visibility booleans', () => {
      expect(migrateCameraPersistedState({
        showCameras: false,
        cameraDisplayMode: 'frustum',
      }, 0)).toMatchObject({
        showCameras: false,
        cameraDisplayMode: 'frustum',
      });
    });

    it('converts hidden selection color mode into the highlight flag', () => {
      expect(migrateCameraPersistedState({ selectionColorMode: 'off' }, 1)).toMatchObject({
        showSelectionHighlight: false,
        selectionColorMode: 'rainbow',
      });
    });

    it('normalizes stale already-migrated camera and selection modes', () => {
      expect(migrateCameraPersistedState({
        showCameras: true,
        cameraDisplayMode: 'off',
        selectionColorMode: 'custom',
        cameraMode: 'trackball',
        cameraProjection: 'isometric',
        cameraScaleFactor: 'focal',
        frustumColorMode: 'camera',
        horizonLock: 'soft',
        autoRotateMode: 'clockwise',
        undistortionMode: 'iterative',
      }, 2)).toMatchObject({
        showCameras: false,
        cameraDisplayMode: 'frustum',
        selectionColorMode: 'rainbow',
        cameraMode: 'orbit',
        cameraProjection: 'perspective',
        cameraScaleFactor: '1',
        frustumColorMode: 'byCamera',
        horizonLock: 'off',
        autoRotateMode: 'off',
        undistortionMode: 'fullFrame',
      });
    });
  });

  describe('migrateRigPersistedState', () => {
    it('converts hidden rig display mode into the showRig flag', () => {
      expect(migrateRigPersistedState({ rigDisplayMode: 'off' }, 0)).toMatchObject({
        showRig: false,
        rigDisplayMode: 'static',
      });
    });

    it('normalizes stale rig display modes while keeping rigs visible', () => {
      expect(migrateRigPersistedState({ rigDisplayMode: 'perFrame' }, 0)).toMatchObject({
        showRig: true,
        rigDisplayMode: 'static',
      });
    });

    it('normalizes stale already-migrated rig modes', () => {
      expect(migrateRigPersistedState({
        showRig: true,
        rigDisplayMode: 'off',
        rigColorMode: 'byCamera',
      }, 1)).toMatchObject({
        showRig: false,
        rigDisplayMode: 'static',
        rigColorMode: 'perFrame',
      });
    });
  });

  describe('migrateUIPersistedState', () => {
    const defaultActions = ['resetView', 'toggleAxes'];

    it('resets old context menu actions and removes obsolete parser settings', () => {
      expect(
        migrateUIPersistedState(
          {
            contextMenuActions: ['legacy'],
            useWasmParser: false,
            liteParserThresholdMB: 12,
            memoryStrategy: 'legacy',
            imageLoadMode: 'legacy',
          },
          2,
          defaultActions
        )
      ).toEqual({
        contextMenuActions: defaultActions,
        showAxes: true,
        showGrid: true,
        showGizmo: false,
        showMatches: false,
        galleryViewMode: 'auto',
        galleryColumns: 2,
        galleryCameraFilter: 'all',
        gallerySortField: 'name',
        gallerySortDirection: 'asc',
        galleryBorderColorMode: 'auto',
        galleryThumbnailDisplayMode: 'image',
      });
    });

    it('splits legacy axes display mode into independent axes and grid flags', () => {
      expect(migrateUIPersistedState({ axesDisplayMode: 'axes' }, 6, defaultActions)).toMatchObject({
        showAxes: true,
        showGrid: false,
      });

      expect(migrateUIPersistedState({ axesDisplayMode: 'grid' }, 6, defaultActions)).toMatchObject({
        showAxes: false,
        showGrid: true,
      });
    });

    it('preserves explicit legacy axes and grid visibility booleans', () => {
      expect(migrateUIPersistedState({
        showAxes: false,
        showGrid: false,
      }, 6, defaultActions)).toMatchObject({
        showAxes: false,
        showGrid: false,
      });
    });

    it('converts legacy gizmo and matches modes into explicit visibility flags', () => {
      expect(
        migrateUIPersistedState(
          { gizmoMode: 'global', matchesDisplayMode: 'off' },
          7,
          defaultActions
        )
      ).toMatchObject({
        showGizmo: true,
        showMatches: false,
        matchesDisplayMode: 'static',
      });

      expect(migrateUIPersistedState({ matchesDisplayMode: 'static' }, 8, defaultActions))
        .toMatchObject({
          showMatches: true,
          matchesDisplayMode: 'static',
        });
    });

    it('preserves explicit legacy matches visibility booleans', () => {
      expect(migrateUIPersistedState({
        showMatches: false,
        matchesDisplayMode: 'static',
      }, 8, defaultActions)).toMatchObject({
        showMatches: false,
        matchesDisplayMode: 'static',
      });
    });

    it('normalizes stale matches modes from already migrated UI stores', () => {
      expect(migrateUIPersistedState({
        showMatches: true,
        matchesDisplayMode: 'off',
      }, 10, defaultActions)).toMatchObject({
        showMatches: false,
        matchesDisplayMode: 'static',
      });

      expect(migrateUIPersistedState({
        showMatches: true,
        matchesDisplayMode: 'unexpected',
      }, 10, defaultActions)).toMatchObject({
        showMatches: true,
        matchesDisplayMode: 'static',
      });
    });

    it('normalizes stale axis settings from already migrated UI stores', () => {
      expect(migrateUIPersistedState({
        axesCoordinateSystem: 'z-up',
        axisLabelMode: 'none',
      }, 11, defaultActions)).toMatchObject({
        axesCoordinateSystem: 'colmap',
        axisLabelMode: 'extra',
      });
    });

    it('adds the auto-hide defaults for existing persisted UI settings', () => {
      expect(
        migrateUIPersistedState({ autoHideElements: { axes: false } }, 9, defaultActions)
      ).toMatchObject({
        autoHideElements: {
          axes: true,
          grid: true,
          gizmo: true,
          buttons: true,
        },
      });
    });

    it('enables axes, grid, and gizmo auto-hide for the previous persisted UI version', () => {
      expect(
        migrateUIPersistedState({
          autoHideElements: {
            buttons: true,
            axes: false,
            grid: false,
            gizmo: false,
            points: false,
            cameras: false,
            matches: false,
            rigs: false,
          },
        }, 11, defaultActions)
      ).toMatchObject({
        autoHideElements: {
          buttons: true,
          axes: true,
          grid: true,
          gizmo: true,
          points: false,
          cameras: false,
          matches: false,
          rigs: false,
        },
      });
    });

    it('normalizes stale gallery settings from persisted UI stores', () => {
      expect(migrateUIPersistedState({
        galleryViewMode: 'wide',
        galleryColumns: 99.2,
        galleryCameraFilter: 7,
        gallerySortField: 'score',
        gallerySortDirection: 'down',
        galleryBorderColorMode: 'metric',
        galleryThumbnailDisplayMode: 'alpha',
      }, 13, defaultActions)).toMatchObject({
        galleryViewMode: 'auto',
        galleryColumns: 10,
        galleryCameraFilter: '7',
        gallerySortField: 'name',
        gallerySortDirection: 'asc',
        galleryBorderColorMode: 'auto',
        galleryThumbnailDisplayMode: 'image',
      });
    });
  });

  it('handles malformed persisted states without throwing', () => {
    expect(migrateCameraPersistedState(null, 0)).toEqual({
      showCameras: true,
      showSelectionHighlight: true,
    });
    expect(migrateRigPersistedState('invalid', 0)).toEqual({ showRig: true });
    expect(migrateUIPersistedState(undefined, 10, [])).toEqual({
      galleryViewMode: 'auto',
      galleryColumns: 2,
      galleryCameraFilter: 'all',
      gallerySortField: 'name',
      gallerySortDirection: 'asc',
      galleryBorderColorMode: 'auto',
      galleryThumbnailDisplayMode: 'image',
    });
  });
});
