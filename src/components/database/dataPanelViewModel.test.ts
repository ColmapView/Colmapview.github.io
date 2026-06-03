import { describe, expect, it } from 'vitest';
import { CameraModelId } from '../../types/colmap';
import {
  buildCamera,
  buildImage,
  buildPoint2D,
  buildReconstruction,
} from '../../test/builders';
import {
  DATA_PANEL_IMAGE_LIMIT,
  DATA_PANEL_TABS,
  getDataPanelCameraRows,
  getDataPanelImageLimitMessage,
  getDataPanelImageRows,
  getDataPanelPointStatCards,
} from './dataPanelViewModel';

describe('data panel view model', () => {
  it('exposes stable tab labels', () => {
    expect(DATA_PANEL_TABS).toEqual([
      { id: 'cameras', label: 'Cameras' },
      { id: 'images', label: 'Images' },
      { id: 'points', label: 'Points' },
    ]);
  });

  it('builds camera table rows with formatted sizes and focal values', () => {
    const reconstruction = buildReconstruction({
      cameras: [
        buildCamera({
          cameraId: 2,
          modelId: CameraModelId.SIMPLE_PINHOLE,
          width: 1920,
          height: 1080,
          params: [1234.567],
        }),
        buildCamera({
          cameraId: 3,
          modelId: CameraModelId.OPENCV,
          width: 800,
          height: 600,
          params: [],
        }),
      ],
    });

    expect(getDataPanelCameraRows(reconstruction)).toEqual([
      {
        cameraId: 2,
        modelId: CameraModelId.SIMPLE_PINHOLE,
        modelName: 'Simple Pinhole',
        colmapModelName: 'SIMPLE_PINHOLE',
        size: '1920x1080',
        focal: '1234.57',
      },
      {
        cameraId: 3,
        modelId: CameraModelId.OPENCV,
        modelName: 'OpenCV',
        colmapModelName: 'OPENCV',
        size: '800x600',
        focal: undefined,
      },
    ]);
  });

  it('builds limited image rows and prefers stored point counts', () => {
    const reconstruction = buildReconstruction({
      images: [
        buildImage({
          imageId: 10,
          cameraId: 2,
          name: 'a.jpg',
          points2D: [buildPoint2D(), buildPoint2D()],
          numPoints2D: 42,
        }),
        buildImage({
          imageId: 11,
          cameraId: 3,
          name: 'b.jpg',
          points2D: [buildPoint2D(), buildPoint2D(), buildPoint2D()],
        }),
        buildImage({ imageId: 12, cameraId: 4, name: 'c.jpg' }),
      ],
    });

    expect(getDataPanelImageRows(reconstruction, 2)).toEqual([
      {
        imageId: 10,
        name: 'a.jpg',
        cameraId: 2,
        pointCount: 42,
      },
      {
        imageId: 11,
        name: 'b.jpg',
        cameraId: 3,
        pointCount: 3,
      },
    ]);
    expect(getDataPanelImageLimitMessage(reconstruction, 2)).toBe('Showing 2 of 3 images');
    expect(getDataPanelImageLimitMessage(reconstruction, 3)).toBeNull();
    expect(DATA_PANEL_IMAGE_LIMIT).toBe(100);
  });

  it('formats point statistic cards from global stats', () => {
    const reconstruction = buildReconstruction({
      globalStats: {
        totalPoints: 12345,
        avgTrackLength: 6.789,
        minTrackLength: 2,
        maxTrackLength: 31,
        avgError: 0.12345,
        maxError: 4.56789,
      },
    });

    expect(getDataPanelPointStatCards(reconstruction)).toEqual([
      { label: 'Total Points', value: '12,345' },
      { label: 'Avg Track Length', value: '6.79' },
      { label: 'Min Track Length', value: '2' },
      { label: 'Max Track Length', value: '31' },
      { label: 'Avg Error (px)', value: '0.123' },
      { label: 'Max Error (px)', value: '4.568' },
    ]);
  });

  it('returns empty rows and stats without reconstruction data', () => {
    expect(getDataPanelCameraRows(null)).toEqual([]);
    expect(getDataPanelImageRows(null)).toEqual([]);
    expect(getDataPanelImageLimitMessage(null)).toBeNull();
    expect(getDataPanelPointStatCards(null)).toEqual([]);
    expect(getDataPanelPointStatCards(buildReconstruction())).toEqual([]);
  });
});
