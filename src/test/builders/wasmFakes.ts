import { WasmReconstructionWrapper } from '../../wasm/reconstruction';
import type { ColmapWasmModule } from '../../wasm/types';
import type { Camera, Image } from '../../types/colmap';
import { parseCameraModelId } from '../../utils/cameraModelPolicy';

interface WasmReconstructionWrapperBuilderOptions {
  positions?: Float32Array | null;
  colors?: Float32Array | null;
  errors?: Float32Array | null;
  trackLengths?: Uint32Array | null;
  trackOffsets?: Uint32Array | null;
  trackImageIds?: Uint32Array | null;
  trackPoint2DIdxs?: Uint32Array | null;
  point3DIds?: BigUint64Array | null;
  pointCount?: number;
  getImagePoints2DArray?: WasmReconstructionWrapper['getImagePoints2DArray'];
}

interface NodeColmapWasmFactoryOptions {
  wasmBinary: Uint8Array;
  locateFile?: (file: string) => string;
}

export type NodeColmapWasmFactory = (
  options: NodeColmapWasmFactoryOptions
) => Promise<ColmapWasmModule>;

interface DefaultColmapWasmFactoryModule {
  default: NodeColmapWasmFactory;
}

export function buildWasmReconstructionWrapper({
  positions = null,
  colors = null,
  errors = null,
  trackLengths = null,
  trackOffsets = null,
  trackImageIds = null,
  trackPoint2DIdxs = null,
  point3DIds = null,
  pointCount,
  getImagePoints2DArray = () => [],
}: WasmReconstructionWrapperBuilderOptions = {}): WasmReconstructionWrapper {
  const wrapper = new WasmReconstructionWrapper();
  const count = pointCount ?? Math.floor((positions?.length ?? 0) / 3);

  Object.defineProperties(wrapper, {
    getColors: {
      configurable: true,
      value: () => colors,
    },
    getErrors: {
      configurable: true,
      value: () => errors,
    },
    getImagePoints2DArray: {
      configurable: true,
      value: getImagePoints2DArray,
    },
    getPoint3DIds: {
      configurable: true,
      value: () => point3DIds,
    },
    getPositions: {
      configurable: true,
      value: () => positions,
    },
    getTrackImageIds: {
      configurable: true,
      value: () => trackImageIds,
    },
    getTrackLengths: {
      configurable: true,
      value: () => trackLengths,
    },
    getTrackOffsets: {
      configurable: true,
      value: () => trackOffsets,
    },
    getTrackPoint2DIdxs: {
      configurable: true,
      value: () => trackPoint2DIdxs,
    },
    pointCount: {
      configurable: true,
      get: () => count,
    },
  });

  return wrapper;
}

export function resolveColmapWasmFactory(moduleValue: unknown): NodeColmapWasmFactory {
  if (isNodeColmapWasmFactory(moduleValue)) {
    return moduleValue;
  }

  if (isDefaultColmapWasmFactoryModule(moduleValue)) {
    return moduleValue.default;
  }

  throw new TypeError('Expected colmap_wasm module to export a factory function');
}

export function buildWasmCameraImageMaps(
  wasm: Pick<WasmReconstructionWrapper, 'getAllCameras' | 'getAllImageInfos'>
): { cameras: Map<number, Camera>; images: Map<number, Image> } {
  const cameras = new Map<number, Camera>();
  for (const camera of Object.values(wasm.getAllCameras())) {
    cameras.set(camera.cameraId, {
      cameraId: camera.cameraId,
      modelId: parseCameraModelId(camera.modelId, `WASM camera ${camera.cameraId}`),
      width: camera.width,
      height: camera.height,
      params: camera.params,
    });
  }

  const images = new Map<number, Image>();
  for (const info of wasm.getAllImageInfos()) {
    const q = info.quaternion ?? [1, 0, 0, 0];
    const t = info.translation ?? [0, 0, 0];
    images.set(info.imageId, {
      imageId: info.imageId,
      qvec: [q[0], q[1], q[2], q[3]],
      tvec: [t[0], t[1], t[2]],
      cameraId: info.cameraId,
      name: info.name,
      points2D: [],
    });
  }

  return { cameras, images };
}

function isNodeColmapWasmFactory(value: unknown): value is NodeColmapWasmFactory {
  return typeof value === 'function';
}

function isDefaultColmapWasmFactoryModule(value: unknown): value is DefaultColmapWasmFactoryModule {
  return isRecord(value) && isNodeColmapWasmFactory(value.default);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
