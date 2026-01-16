import { describe, it, expect } from 'vitest';
import { parseCamerasText } from './cameras';
import { CameraModelId } from '../types/colmap';

describe('parseCamerasText', () => {
  it('returns empty map for empty input', () => {
    const result = parseCamerasText('');
    expect(result.size).toBe(0);
  });

  it('skips comment lines', () => {
    const input = `# This is a comment
# Another comment
# Number of cameras: 0`;
    const result = parseCamerasText(input);
    expect(result.size).toBe(0);
  });

  it('parses SIMPLE_PINHOLE camera', () => {
    const input = '1 SIMPLE_PINHOLE 3072 2304 2559.81 1536 1152';
    const result = parseCamerasText(input);

    expect(result.size).toBe(1);
    const camera = result.get(1);
    expect(camera).toBeDefined();
    expect(camera!.cameraId).toBe(1);
    expect(camera!.modelId).toBe(CameraModelId.SIMPLE_PINHOLE);
    expect(camera!.width).toBe(3072);
    expect(camera!.height).toBe(2304);
    expect(camera!.params).toEqual([2559.81, 1536, 1152]);
  });

  it('parses PINHOLE camera', () => {
    const input = '2 PINHOLE 1920 1080 1000 1000 960 540';
    const result = parseCamerasText(input);

    const camera = result.get(2);
    expect(camera).toBeDefined();
    expect(camera!.modelId).toBe(CameraModelId.PINHOLE);
    expect(camera!.params).toEqual([1000, 1000, 960, 540]);
  });

  it('parses multiple cameras', () => {
    const input = `# Camera list
1 SIMPLE_PINHOLE 3072 2304 2559.81 1536 1152
2 PINHOLE 1920 1080 1000 1000 960 540
3 SIMPLE_RADIAL 640 480 500 320 240 0.1`;
    const result = parseCamerasText(input);

    expect(result.size).toBe(3);
    expect(result.has(1)).toBe(true);
    expect(result.has(2)).toBe(true);
    expect(result.has(3)).toBe(true);
  });

  it('handles OPENCV camera with many parameters', () => {
    const input = '1 OPENCV 1920 1080 1000 1000 960 540 0.1 0.2 0.01 0.02';
    const result = parseCamerasText(input);

    const camera = result.get(1);
    expect(camera).toBeDefined();
    expect(camera!.modelId).toBe(CameraModelId.OPENCV);
    expect(camera!.params).toHaveLength(8);
  });

  it('skips lines with too few parts', () => {
    const input = `1 SIMPLE_PINHOLE 3072`;
    const result = parseCamerasText(input);
    expect(result.size).toBe(0);
  });

  it('handles mixed content with comments and empty lines', () => {
    const input = `# Camera list with one line of data per camera:
#   CAMERA_ID, MODEL, WIDTH, HEIGHT, PARAMS[]

1 SIMPLE_PINHOLE 3072 2304 2559.81 1536 1152

# Another section
2 PINHOLE 1920 1080 1000 1000 960 540
`;
    const result = parseCamerasText(input);
    expect(result.size).toBe(2);
  });

  it('handles camera with no params', () => {
    // Edge case: no params after width/height
    const input = '1 SIMPLE_PINHOLE 3072 2304';
    const result = parseCamerasText(input);

    const camera = result.get(1);
    expect(camera).toBeDefined();
    expect(camera!.params).toEqual([]);
  });
});
