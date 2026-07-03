import { describe, expect, it } from 'vitest';
import {
  CAMERA_DISPLAY_MODE_CONTROL,
  MATCHES_DISPLAY_MODE_CONTROL,
  POINT_CLOUD_MODE_CONTROL,
  RIG_DISPLAY_MODE_CONTROL,
  SELECTION_COLOR_MODE_CONTROL,
  buildExampleManifest,
  buildExampleManifestJson,
  buildRigInfo,
  getAxesGridButtonState,
  getCameraDisplayButtonState,
  getCameraModeButtonState,
  getMatchesButtonState,
  getNextAxesGridState,
  getNextCameraDisplayState,
  getNextMatchesDisplayState,
  getNextPointColorState,
  getNextRigDisplayState,
  getNextSelectionColorState,
  getPointCloudButtonState,
  getRigButtonState,
  getSelectionButtonState,
  getToggledBackgroundHsl,
  reconstructionHasPinholeCameras,
  syncHslWithHex,
  toSuperscript,
} from './viewerControlsViewModel';
import { buildCamera, buildFrame, buildImage, buildReconstruction, buildRigData } from '../../test/builders';
import { CameraModelId } from '../../types/colmap';
import { SensorType } from '../../types/rig';

describe('viewer controls view-model helpers', () => {
  it('formats numeric exponents for compact display', () => {
    expect(toSuperscript(0)).toBe('⁰·⁰');
    expect(toSuperscript(2.5)).toBe('²·⁵');
    expect(toSuperscript(-1.2)).toBe('⁻¹·²');
  });

  it('derives rig information from shared frame names', () => {
    const camera1 = buildCamera({ cameraId: 1 });
    const camera2 = buildCamera({ cameraId: 2 });
    const camera3 = buildCamera({ cameraId: 3 });
    const reconstruction = buildReconstruction({
      cameras: [camera1, camera2, camera3],
      images: [
        buildImage({ imageId: 1, cameraId: camera1.cameraId, name: 'cam_1/frame_0001.png' }),
        buildImage({ imageId: 2, cameraId: camera2.cameraId, name: 'cam_2/frame_0001.png' }),
        buildImage({ imageId: 3, cameraId: camera1.cameraId, name: 'cam_1/frame_0002.png' }),
        buildImage({ imageId: 4, cameraId: camera2.cameraId, name: 'cam_2/frame_0003.png' }),
        buildImage({ imageId: 5, cameraId: camera3.cameraId, name: 'cam_3/frame_0003.png' }),
        buildImage({ imageId: 6, cameraId: camera1.cameraId, name: 'cam_1/frame_0003.png' }),
      ],
    });

    expect(buildRigInfo(null)).toEqual({ hasRigData: false, cameraCount: 0, frameCount: 0 });
    expect(buildRigInfo(reconstruction)).toEqual({
      hasRigData: true,
      cameraCount: 3,
      frameCount: 2,
    });
  });

  it('prefers parsed rig frames over filename inference', () => {
    const camera1 = buildCamera({ cameraId: 1 });
    const camera2 = buildCamera({ cameraId: 2 });
    const reconstruction = buildReconstruction({
      cameras: [camera1, camera2],
      images: [
        buildImage({ imageId: 10, cameraId: camera1.cameraId, name: 'left/0001.png' }),
        buildImage({ imageId: 20, cameraId: camera2.cameraId, name: 'right/0002.png' }),
        buildImage({ imageId: 30, cameraId: camera1.cameraId, name: 'left/0003.png' }),
      ],
      rigData: buildRigData({
        frames: [
          buildFrame({
            frameId: 1,
            dataIds: [
              { sensorId: { type: SensorType.CAMERA, id: camera1.cameraId }, dataId: 10 },
              { sensorId: { type: SensorType.IMU, id: 1 }, dataId: 99 },
              { sensorId: { type: SensorType.CAMERA, id: camera2.cameraId }, dataId: 20 },
            ],
          }),
          buildFrame({
            frameId: 2,
            dataIds: [
              { sensorId: { type: SensorType.CAMERA, id: camera1.cameraId }, dataId: 30 },
              { sensorId: { type: SensorType.CAMERA, id: camera2.cameraId }, dataId: 999 },
            ],
          }),
        ],
      }),
    });

    expect(buildRigInfo(reconstruction)).toEqual({
      hasRigData: true,
      cameraCount: 2,
      frameCount: 1,
    });
  });

  it('does not infer rig availability from filenames when parsed rig data is present', () => {
    const camera1 = buildCamera({ cameraId: 1 });
    const camera2 = buildCamera({ cameraId: 2 });
    const reconstruction = buildReconstruction({
      cameras: [camera1, camera2],
      images: [
        buildImage({ imageId: 1, cameraId: camera1.cameraId, name: 'cam_1/frame_0001.png' }),
        buildImage({ imageId: 2, cameraId: camera2.cameraId, name: 'cam_2/frame_0001.png' }),
      ],
      rigData: buildRigData({
        frames: [
          buildFrame({
            frameId: 1,
            dataIds: [
              { sensorId: { type: SensorType.CAMERA, id: camera1.cameraId }, dataId: 1 },
            ],
          }),
        ],
      }),
    });

    expect(buildRigInfo(reconstruction)).toEqual({
      hasRigData: false,
      cameraCount: 0,
      frameCount: 0,
    });
  });

  it('keeps local HSL stable unless the source hex changes', () => {
    const current = { h: 0, s: 0, l: 100 };

    expect(syncHslWithHex(current, '#ffffff')).toBe(current);
    expect(syncHslWithHex(current, '#000000')).toEqual({ h: 0, s: 0, l: 0 });
    expect(getToggledBackgroundHsl({ h: 200, s: 80, l: 40 })).toEqual({ h: 0, s: 0, l: 100 });
    expect(getToggledBackgroundHsl({ h: 200, s: 80, l: 50 })).toEqual({ h: 0, s: 0, l: 0 });
  });

  it('cycles point, camera, matches, selection, rig, axes, and grid states', () => {
    expect(POINT_CLOUD_MODE_CONTROL.activeButtons.map((button) => button.mode)).toEqual([
      'rgb',
      'error',
      'trackLength',
      'splats',
      'splatPoints',
      'splatRainbowPoints',
    ]);
    expect(CAMERA_DISPLAY_MODE_CONTROL.activeButtons.map((button) => button.mode)).toEqual(['frustum', 'arrow', 'imageplane']);
    expect(MATCHES_DISPLAY_MODE_CONTROL.activeButtons.map((button) => button.mode)).toEqual(['static', 'blink']);
    expect(SELECTION_COLOR_MODE_CONTROL.activeButtons.map((button) => button.mode)).toEqual(['static', 'blink', 'rainbow']);
    expect(RIG_DISPLAY_MODE_CONTROL.activeButtons.map((button) => button.mode)).toEqual(['static', 'blink']);

    expect(getNextPointColorState(false, 'trackLength')).toEqual({ visible: true, mode: 'rgb' });
    expect(getNextPointColorState(true, 'rgb')).toEqual({ visible: true, mode: 'error' });
    expect(getNextPointColorState(true, 'error')).toEqual({ visible: true, mode: 'trackLength' });
    expect(getNextPointColorState(true, 'trackLength')).toEqual({ visible: true, mode: 'splats' });
    expect(getNextPointColorState(true, 'splats')).toEqual({ visible: true, mode: 'splatPoints' });
    expect(getNextPointColorState(true, 'splatPoints')).toEqual({ visible: true, mode: 'splatRainbowPoints' });
    expect(getNextPointColorState(true, 'splatRainbowPoints')).toEqual({ visible: false, mode: 'splatRainbowPoints' });

    expect(getNextCameraDisplayState(false, 'imageplane')).toEqual({ visible: true, mode: 'frustum' });
    expect(getNextCameraDisplayState(true, 'frustum')).toEqual({ visible: true, mode: 'arrow' });
    expect(getNextCameraDisplayState(true, 'arrow')).toEqual({ visible: true, mode: 'imageplane' });
    expect(getNextCameraDisplayState(true, 'imageplane')).toEqual({ visible: false, mode: 'imageplane' });

    expect(getNextMatchesDisplayState(false, 'blink')).toEqual({ visible: true, mode: 'static' });
    expect(getNextMatchesDisplayState(true, 'static')).toEqual({ visible: true, mode: 'blink' });
    expect(getNextMatchesDisplayState(true, 'blink')).toEqual({ visible: false, mode: 'blink' });

    expect(getNextSelectionColorState(false, 'rainbow')).toEqual({ visible: true, mode: 'static' });
    expect(getNextSelectionColorState(true, 'static')).toEqual({ visible: true, mode: 'blink' });
    expect(getNextSelectionColorState(true, 'blink')).toEqual({ visible: true, mode: 'rainbow' });
    expect(getNextSelectionColorState(true, 'rainbow')).toEqual({ visible: false, mode: 'rainbow' });

    expect(getNextRigDisplayState(false, 'blink')).toEqual({ visible: true, mode: 'static' });
    expect(getNextRigDisplayState(true, 'static')).toEqual({ visible: true, mode: 'blink' });
    expect(getNextRigDisplayState(true, 'blink')).toEqual({ visible: false, mode: 'blink' });

    expect(getNextAxesGridState(true, true)).toEqual({ showAxes: true, showGrid: false });
    expect(getNextAxesGridState(true, false)).toEqual({ showAxes: false, showGrid: true });
    expect(getNextAxesGridState(false, true)).toEqual({ showAxes: false, showGrid: false });
    expect(getNextAxesGridState(false, false)).toEqual({ showAxes: true, showGrid: true });
  });

  it('derives compact toolbar button state', () => {
    expect(getAxesGridButtonState(true, true)).toMatchObject({
      icon: 'axesGrid',
      label: 'A+G',
      tooltip: 'Axes & Grid (G)',
      isActive: true,
    });
    expect(getAxesGridButtonState(false, false)).toMatchObject({
      icon: 'axesOff',
      label: 'OFF',
      isActive: false,
    });

    expect(getCameraModeButtonState('orbit')).toEqual({
      icon: 'orbit',
      label: 'ORB',
      tooltip: 'Orbit mode (C)',
    });
    expect(getCameraModeButtonState('fly')).toEqual({
      icon: 'fly',
      label: 'FLY',
      tooltip: 'Fly mode (C)',
    });

    expect(getPointCloudButtonState(false, 'trackLength')).toMatchObject({
      icon: 'pointsOff',
      label: 'OFF',
      tooltip: 'Point Cloud: Off (P)',
      isActive: false,
    });
    expect(getPointCloudButtonState(true, 'rgb')).toMatchObject({
      icon: 'pointsRgb',
      label: 'RGB',
      tooltip: 'Point Cloud: RGB (P)',
      isActive: true,
    });
    expect(getPointCloudButtonState(true, 'error')).toMatchObject({
      icon: 'pointsError',
      label: 'ERR',
      tooltip: 'Point Cloud: Error (P)',
    });
    expect(getPointCloudButtonState(true, 'trackLength')).toMatchObject({
      icon: 'pointsTrack',
      label: 'TRK',
      tooltip: 'Point Cloud: Track (P)',
    });
    expect(getPointCloudButtonState(true, 'splats')).toMatchObject({
      icon: 'pointsSplats',
      label: 'SPL',
      tooltip: 'Point Cloud: Splats (P)',
    });
    expect(getPointCloudButtonState(true, 'splatPoints')).toMatchObject({
      icon: 'pointsSplatPoints',
      label: 'S+P',
      tooltip: 'Point Cloud: Splats + Blinking Points (P)',
    });
    expect(getPointCloudButtonState(true, 'splatRainbowPoints')).toMatchObject({
      icon: 'pointsSplatRainbow',
      label: 'RNB',
      tooltip: 'Point Cloud: Splats + Rainbow Points (P)',
    });

    expect(getCameraDisplayButtonState(false, 'imageplane')).toMatchObject({
      icon: 'cameraOff',
      label: 'OFF',
      tooltip: 'Cameras hidden (F)',
      isActive: false,
    });
    expect(getCameraDisplayButtonState(true, 'frustum')).toMatchObject({
      icon: 'frustum',
      label: 'FRM',
      tooltip: 'Frustum mode (F)',
    });
    expect(getCameraDisplayButtonState(true, 'arrow')).toMatchObject({
      icon: 'arrow',
      label: 'ARW',
      tooltip: 'Arrow mode (F)',
    });
    expect(getCameraDisplayButtonState(true, 'imageplane')).toMatchObject({
      icon: 'imageplane',
      label: 'IMG',
      tooltip: 'Image plane mode (F)',
    });

    expect(getMatchesButtonState(false, 'blink')).toMatchObject({
      icon: 'matchesOff',
      tooltip: 'Matches off (M)',
      isActive: false,
    });
    expect(getMatchesButtonState(true, 'static')).toMatchObject({
      icon: 'matchesStatic',
      tooltip: 'Matches static (M)',
    });
    expect(getMatchesButtonState(true, 'blink')).toMatchObject({
      icon: 'matchesBlink',
      tooltip: 'Matches blink (M)',
    });

    expect(getSelectionButtonState(false, 'rainbow')).toMatchObject({
      icon: 'selectionOff',
      tooltip: 'Selection off',
      isActive: false,
    });
    expect(getSelectionButtonState(true, 'static')).toMatchObject({
      icon: 'selectionStatic',
      tooltip: 'Static color',
    });
    expect(getSelectionButtonState(true, 'blink')).toMatchObject({
      icon: 'selectionBlink',
      tooltip: 'Blink',
    });
    expect(getSelectionButtonState(true, 'rainbow')).toMatchObject({
      icon: 'selectionRainbow',
      tooltip: 'Rainbow',
    });

    expect(getRigButtonState(false, true, 'blink')).toMatchObject({
      icon: 'rigOff',
      label: 'N/A',
      tooltip: 'Rig not available',
      disabled: true,
      isActive: false,
    });
    expect(getRigButtonState(true, false, 'blink')).toMatchObject({
      icon: 'rigOff',
      label: 'OFF',
      tooltip: 'Rig connections off',
      disabled: false,
    });
    expect(getRigButtonState(true, true, 'static')).toMatchObject({
      icon: 'rigStatic',
      label: 'RIG',
      tooltip: 'Rig static',
    });
    expect(getRigButtonState(true, true, 'blink')).toMatchObject({
      icon: 'rigBlink',
      label: 'BLK',
      tooltip: 'Rig blink',
    });
  });

  it('builds the downloadable example URL manifest', () => {
    const manifest = buildExampleManifest();

    expect(manifest).toMatchObject({
      version: 1,
      name: 'NGS Lady Bug Toy',
      imagesPath: 'images/',
      masksPath: 'masks/',
    });
    expect(manifest.files).toEqual({
      cameras: 'sparse/0/cameras.bin',
      images: 'sparse/0/images.bin',
      points3D: 'sparse/0/points3D.bin',
      rigs: 'sparse/0/rigs.bin',
      frames: 'sparse/0/frames.bin',
    });
    expect(JSON.parse(buildExampleManifestJson())).toEqual(manifest);
  });
});

describe('reconstructionHasPinholeCameras', () => {
  it('treats a missing reconstruction as having pinhole cameras', () => {
    expect(reconstructionHasPinholeCameras(null)).toBe(true);
  });

  it('treats a reconstruction with no cameras as having pinhole cameras', () => {
    const reconstruction = buildReconstruction({ cameras: [], images: [] });

    expect(reconstructionHasPinholeCameras(reconstruction)).toBe(true);
  });

  it('returns true for a pinhole-only reconstruction', () => {
    const reconstruction = buildReconstruction({
      cameras: [buildCamera({ cameraId: 1, modelId: CameraModelId.PINHOLE })],
    });

    expect(reconstructionHasPinholeCameras(reconstruction)).toBe(true);
  });

  it('returns true for a non-spherical fisheye-only reconstruction', () => {
    const reconstruction = buildReconstruction({
      cameras: [buildCamera({ cameraId: 1, modelId: CameraModelId.OPENCV_FISHEYE })],
    });

    expect(reconstructionHasPinholeCameras(reconstruction)).toBe(true);
  });

  it('returns true for a mixed reconstruction containing at least one non-spherical camera', () => {
    const reconstruction = buildReconstruction({
      cameras: [
        buildCamera({ cameraId: 1, modelId: CameraModelId.EQUIRECTANGULAR, params: [640, 480] }),
        buildCamera({ cameraId: 2, modelId: CameraModelId.PINHOLE }),
      ],
    });

    expect(reconstructionHasPinholeCameras(reconstruction)).toBe(true);
  });

  it('returns false for a spherical-only reconstruction', () => {
    const reconstruction = buildReconstruction({
      cameras: [buildCamera({ cameraId: 1, modelId: CameraModelId.EQUIRECTANGULAR, params: [640, 480] })],
    });

    expect(reconstructionHasPinholeCameras(reconstruction)).toBe(false);
  });
});
