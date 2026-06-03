import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CameraModelId } from '../types/colmap';
import { SensorType } from '../types/rig';
import { createWasmReconstruction } from '../wasm';
import type { CameraInfo } from '../wasm/types';
import { buildBinaryFile, buildWasmReconstructionWrapper } from '../test/builders';
import { parseWithWasm } from './wasmParser';

vi.mock('../wasm', async (importActual) => {
  const actual = await importActual<typeof import('../wasm')>();
  return {
    ...actual,
    createWasmReconstruction: vi.fn(),
  };
});

beforeEach(() => {
  vi.mocked(createWasmReconstruction).mockReset();
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('parseWithWasm', () => {
  it('converts WASM cameras with supported camera model IDs', async () => {
    const wasm = createWasmParserWrapper(buildWasmCamera(CameraModelId.PINHOLE));
    vi.mocked(createWasmReconstruction).mockResolvedValue(wasm);

    const result = await parseWithWasm(
      buildBinaryFile('cameras.bin', ''),
      buildBinaryFile('images.bin', ''),
      buildBinaryFile('points3D.bin', '')
    );

    expect(result?.cameras.get(1)?.modelId).toBe(CameraModelId.PINHOLE);
    expect(result?.wasmWrapper).toBe(wasm);
    expect(console.log).toHaveBeenCalledWith(expect.stringMatching(/^\[WASM] Parsed in \d+ms:/));
    expect(console.log).toHaveBeenCalledWith(expect.stringMatching(/^\[WASM] Converted to JS Maps in \d+ms$/));
  });

  it('falls back and disposes WASM when conversion exposes an unsupported camera model ID', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const wasm = createWasmParserWrapper(buildWasmCamera(999));
    const dispose = vi.spyOn(wasm, 'dispose');
    vi.mocked(createWasmReconstruction).mockResolvedValue(wasm);

    await expect(parseWithWasm(
      buildBinaryFile('cameras.bin', ''),
      buildBinaryFile('images.bin', ''),
      buildBinaryFile('points3D.bin', '')
    )).resolves.toBeNull();

    expect(dispose).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalledWith(
      '[WASM] Error during parsing, falling back to JS:',
      expect.any(Error)
    );
  });

  it('converts WASM rig and frame sensor types when supported', async () => {
    const wasm = createWasmParserWrapper(buildWasmCamera(CameraModelId.PINHOLE));
    vi.mocked(createWasmReconstruction).mockResolvedValue(wasm);

    const result = await parseWithWasm(
      buildBinaryFile('cameras.bin', ''),
      buildBinaryFile('images.bin', ''),
      buildBinaryFile('points3D.bin', ''),
      buildBinaryFile('rigs.bin', ''),
      buildBinaryFile('frames.bin', '')
    );

    expect(result?.rigData?.rigs.get(7)?.sensors[1].sensorId.type).toBe(SensorType.IMU);
    expect(result?.rigData?.frames.get(8)?.dataIds[0].sensorId.type).toBe(SensorType.IMU);
    expect(console.log).toHaveBeenCalledWith(expect.stringMatching(/^\[WASM] Parsed in \d+ms:/));
    expect(console.log).toHaveBeenCalledWith('[WASM] Parsed rig data: 1 rigs, 1 frames');
    expect(console.log).toHaveBeenCalledWith(expect.stringMatching(/^\[WASM] Converted to JS Maps in \d+ms$/));
  });

  it('continues without rig data when WASM exposes an unsupported rig sensor type', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const wasm = createWasmParserWrapper(buildWasmCamera(CameraModelId.PINHOLE), {
      rigSensorType: 999,
    });
    vi.mocked(createWasmReconstruction).mockResolvedValue(wasm);

    const result = await parseWithWasm(
      buildBinaryFile('cameras.bin', ''),
      buildBinaryFile('images.bin', ''),
      buildBinaryFile('points3D.bin', ''),
      buildBinaryFile('rigs.bin', ''),
      buildBinaryFile('frames.bin', '')
    );

    expect(result?.wasmWrapper).toBe(wasm);
    expect(result?.rigData).toBeUndefined();
    expect(warn).toHaveBeenCalledWith(
      '[WASM] Failed to parse rig/frame files:',
      expect.any(Error)
    );
  });
});

function buildWasmCamera(modelId: number): CameraInfo {
  return {
    cameraId: 1,
    modelId,
    width: 640,
    height: 480,
    params: [1, 2, 3, 4],
  };
}

interface WasmParserWrapperOptions {
  frameSensorType?: number;
  rigSensorType?: number;
}

function createWasmParserWrapper(
  camera: CameraInfo,
  {
    frameSensorType = SensorType.IMU,
    rigSensorType = SensorType.IMU,
  }: WasmParserWrapperOptions = {}
) {
  const wrapper = buildWasmReconstructionWrapper({ pointCount: 2 });

  Object.defineProperties(wrapper, {
    cameraCount: {
      configurable: true,
      get: () => 1,
    },
    dispose: {
      configurable: true,
      value: vi.fn(),
    },
    getAllCameras: {
      configurable: true,
      value: () => ({ [camera.cameraId]: camera }),
    },
    getAllImageInfos: {
      configurable: true,
      value: () => [],
    },
    getAllFrames: {
      configurable: true,
      value: () => ({
        8: {
          frameId: 8,
          rigId: 7,
          rigFromWorld: { qvec: [1, 0, 0, 0], tvec: [0, 0, 0] },
          dataIds: [{ sensorId: { type: frameSensorType, id: 2 }, dataId: 42 }],
        },
      }),
    },
    getAllRigs: {
      configurable: true,
      value: () => ({
        7: {
          rigId: 7,
          refSensorId: { type: SensorType.CAMERA, id: 1 },
          sensors: [
            { sensorId: { type: SensorType.CAMERA, id: 1 }, hasPose: false },
            {
              sensorId: { type: rigSensorType, id: 2 },
              hasPose: true,
              pose: { qvec: [1, 0, 0, 0], tvec: [0, 0, 0] },
            },
          ],
        },
      }),
    },
    getNumPoints2DPerImage: {
      configurable: true,
      value: () => new Uint32Array(),
    },
    imageCount: {
      configurable: true,
      get: () => 0,
    },
    hasRigData: {
      configurable: true,
      value: () => true,
    },
    parseCameras: {
      configurable: true,
      value: vi.fn(() => true),
    },
    parseImagesLazy: {
      configurable: true,
      value: vi.fn(() => true),
    },
    parsePoints3D: {
      configurable: true,
      value: vi.fn(() => true),
    },
    parseFrames: {
      configurable: true,
      value: vi.fn(() => true),
    },
    parseRigs: {
      configurable: true,
      value: vi.fn(() => true),
    },
  });

  return wrapper;
}
