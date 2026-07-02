import {
  parseCamerasBinary,
  parseCamerasText,
  parseImagesBinary,
  parseImagesText,
  parsePoints3DBinary,
  parsePointCloudPlyBuffer,
  parsePoints3DText,
  parseWithWasm,
} from '../parsers';
import type { SkippedCameraRecord } from '../parsers';
import type { Camera, Image as ColmapImage, Point3D } from '../types/colmap';
import { appLogger } from '../utils/logger';
import type { RigData } from '../types/rig';
import type { WasmReconstructionWrapper } from '../wasm';

export interface ColmapParserFiles {
  camerasFile: File;
  imagesFile: File;
  points3DFile: File;
  rigsFile?: File;
  framesFile?: File;
}

export interface ColmapParseResult {
  cameras: Map<number, Camera>;
  images: Map<number, ColmapImage>;
  points3D?: Map<bigint, Point3D>;
  wasmRigData?: RigData;
  wasmWrapper: WasmReconstructionWrapper | null;
  usedWasmPath: boolean;
}

export interface ColmapParserDeps {
  parseWithWasm: typeof parseWithWasm;
  parseCamerasBinary: typeof parseCamerasBinary;
  parseCamerasText: typeof parseCamerasText;
  parseImagesBinary: typeof parseImagesBinary;
  parseImagesText: typeof parseImagesText;
  parsePoints3DBinary: typeof parsePoints3DBinary;
  parsePointCloudPlyBuffer: typeof parsePointCloudPlyBuffer;
  parsePoints3DText: typeof parsePoints3DText;
}

interface ParseColmapFilesOptions extends ColmapParserFiles {
  parsers?: ColmapParserDeps;
  addNotification: (type: 'info' | 'warning', message: string, duration?: number) => void;
  log?: (message: string) => void;
}

const defaultParsers: ColmapParserDeps = {
  parseWithWasm,
  parseCamerasBinary,
  parseCamerasText,
  parseImagesBinary,
  parseImagesText,
  parsePoints3DBinary,
  parsePointCloudPlyBuffer,
  parsePoints3DText,
};

export async function parseColmapFiles({
  camerasFile,
  imagesFile,
  points3DFile,
  rigsFile,
  framesFile,
  parsers = defaultParsers,
  addNotification,
  log = appLogger.info,
}: ParseColmapFilesOptions): Promise<ColmapParseResult> {
  log('[Parser] Attempting WASM parser (memory-optimized)...');
  const wasmResult = await parsers.parseWithWasm(
    camerasFile,
    imagesFile,
    points3DFile,
    rigsFile,
    framesFile
  );

  if (wasmResult) {
    addNotification(
      'info',
      `Loaded ${wasmResult.wasmWrapper.pointCount.toLocaleString()} points`,
      5000
    );

    return {
      cameras: wasmResult.cameras,
      images: wasmResult.images,
      wasmRigData: wasmResult.rigData,
      wasmWrapper: wasmResult.wasmWrapper,
      usedWasmPath: true,
    };
  }

  log('[Parser] WASM failed, falling back to JS parser (without 2D points)');
  const useLiteImages = imagesFile.name.endsWith('.bin');

  // Unknown-model cameras in cameras.txt are skipped (partial loads stay
  // useful); collect them so we can surface a single aggregate notification.
  const skippedCameras: SkippedCameraRecord[] = [];

  const [cameras, images, points3D] = await Promise.all([
    camerasFile.name.endsWith('.bin')
      ? camerasFile.arrayBuffer().then(parsers.parseCamerasBinary)
      : camerasFile.text().then(text =>
          parsers.parseCamerasText(text, { onSkip: record => skippedCameras.push(record) })
        ),
    imagesFile.name.endsWith('.bin')
      ? imagesFile.arrayBuffer().then(buf => parsers.parseImagesBinary(buf, true))
      : imagesFile.text().then(parsers.parseImagesText),
    points3DFile.name.endsWith('.bin')
      ? points3DFile.arrayBuffer().then(parsers.parsePoints3DBinary)
      : points3DFile.name.toLowerCase().endsWith('.ply')
      ? points3DFile.arrayBuffer().then(parsers.parsePointCloudPlyBuffer)
      : points3DFile.text().then(parsers.parsePoints3DText),
  ]);

  if (skippedCameras.length > 0) {
    const uniqueModels = [...new Set(skippedCameras.map(s => s.modelName))];
    addNotification(
      'warning',
      `Skipped ${skippedCameras.length} camera(s) with unsupported model(s): ${uniqueModels.join(', ')}`
    );
  }

  if (useLiteImages) {
    addNotification(
      'info',
      '2D point data not loaded. Keypoint overlay may be limited.',
      5000
    );
  }

  return {
    cameras,
    images,
    points3D,
    wasmWrapper: null,
    usedWasmPath: false,
  };
}
