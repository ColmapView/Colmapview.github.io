import type { Reconstruction } from '../types/colmap';
import type { Sim3dEuler } from '../types/sim3d';
import { isReconstructionSnapshot, type ReconstructionSource } from '../wasm/reconstructionService';
import { createSim3dFromEuler, isIdentityEuler, transformReconstruction } from '../utils/sim3dTransforms';
import { getPoints3DForExport } from './reconstructionExportData';
import { writeCamerasBinary, writeImagesBinary, writePoints3DBinary, writeRigsBinary, writeFramesBinary } from './colmapBinaryWriters';
import { awaitWithAbort } from '../utils/awaitWithAbort';

/** Serialize the current model without scheduling browser downloads. */
export async function prepareReconstructionFiles(
  reconstruction: Reconstruction,
  source: ReconstructionSource | null,
  transform: Sim3dEuler,
  signal: AbortSignal,
): Promise<Record<string, Blob>> {
  signal.throwIfAborted();
  const baked = !isIdentityEuler(transform);
  if (isReconstructionSnapshot(source)) {
    const bytes = await awaitWithAbort(source.export({ format: 'binary', transform: baked ? transform : undefined }, signal), signal);
    signal.throwIfAborted();
    return Object.fromEntries(Object.entries(bytes).map(([name, data]) => [name, new Blob([new Uint8Array(data)])]));
  }
  const model = baked ? transformReconstruction(createSim3dFromEuler(transform), reconstruction, source) : reconstruction;
  const files: Record<string, Blob> = {
    'cameras.bin': new Blob([writeCamerasBinary(model.cameras)]),
    'images.bin': new Blob([writeImagesBinary(model.images, source)]),
    'points3D.bin': new Blob([writePoints3DBinary(getPoints3DForExport(model, source))]),
  };
  if (model.rigData?.rigs.size) files['rigs.bin'] = new Blob([writeRigsBinary(model.rigData.rigs)]);
  if (model.rigData?.frames.size) files['frames.bin'] = new Blob([writeFramesBinary(model.rigData.frames)]);
  signal.throwIfAborted();
  return files;
}
