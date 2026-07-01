import { describe, it, expect } from 'vitest';
import { BinaryWriter } from './BinaryWriter';
import { parseCamerasBinary, parseCamerasText } from './cameras';
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

  it('parses RAD_TAN_THIN_PRISM_FISHEYE cameras', () => {
    const input = '7 RAD_TAN_THIN_PRISM_FISHEYE 1920 1080 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16';
    const result = parseCamerasText(input);

    const camera = result.get(7);
    expect(camera).toBeDefined();
    expect(camera!.modelId).toBe(CameraModelId.RAD_TAN_THIN_PRISM_FISHEYE);
    expect(camera!.params).toHaveLength(16);
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

  it('skips rows with partial or invalid numeric tokens', () => {
    const input = `1 SIMPLE_PINHOLE 640px 480 500 320 240
2 SIMPLE_PINHOLE 640 480 500px 320 240
3 SIMPLE_PINHOLE 640 480 500 320 240`;
    const result = parseCamerasText(input);

    expect([...result.keys()]).toEqual([3]);
  });

  it('parses EQUIRECTANGULAR (spherical) cameras', () => {
    const input = '5 EQUIRECTANGULAR 4096 2048 4096 2048';
    const result = parseCamerasText(input);
    const camera = result.get(5);
    expect(camera).toBeDefined();
    expect(camera!.modelId).toBe(CameraModelId.EQUIRECTANGULAR);
    expect(camera!.params).toEqual([4096, 2048]);
  });

  it('parses EUCM cameras', () => {
    const input = '6 EUCM 1920 1080 1000 1000 960 540 0.6 1.1';
    const result = parseCamerasText(input);
    const camera = result.get(6);
    expect(camera).toBeDefined();
    expect(camera!.modelId).toBe(CameraModelId.EUCM);
    expect(camera!.params).toHaveLength(6);
  });
});

describe('parseCamerasBinary', () => {
  it('parses supported binary camera model IDs', () => {
    const result = parseCamerasBinary(createBinaryCameraBuffer(CameraModelId.PINHOLE, [1, 2, 3, 4]));

    const camera = result.get(1);
    expect(camera).toBeDefined();
    expect(camera!.modelId).toBe(CameraModelId.PINHOLE);
    expect(camera!.params).toEqual([1, 2, 3, 4]);
  });

  it('rejects unsupported binary camera model IDs before trusting params', () => {
    expect(() => parseCamerasBinary(createBinaryCameraBuffer(999, []))).toThrow(
      'Unsupported camera model id 999 in binary camera 1'
    );
  });

  it('parses EQUIRECTANGULAR binary cameras with exactly 2 params', () => {
    const result = parseCamerasBinary(createBinaryCameraBuffer(CameraModelId.EQUIRECTANGULAR, [4096, 2048]));
    const camera = result.get(1);
    expect(camera!.modelId).toBe(CameraModelId.EQUIRECTANGULAR);
    expect(camera!.params).toEqual([4096, 2048]);
  });
});

function createBinaryCameraBuffer(modelId: number, params: number[]): ArrayBuffer {
  const writer = new BinaryWriter();
  writer.writeUint64FromNumber(1);
  writer.writeUint32(1);
  writer.writeInt32(modelId);
  writer.writeUint64FromNumber(640);
  writer.writeUint64FromNumber(480);

  for (const param of params) {
    writer.writeFloat64(param);
  }

  return writer.toArrayBuffer();
}
