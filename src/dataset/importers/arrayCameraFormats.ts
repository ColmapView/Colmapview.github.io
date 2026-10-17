import { CameraModelId } from '../../types/cameraModelId';
import { nerfCameraToColmap, validateRotation } from './cameraMath';
import { emptyCameraDataset, addCameraFrame, finishCameraDataset } from './cameraDatasetBuilder';
import type { ResolveCameraFrame } from './nerfTransforms';
import type { NumpyCameraArray } from './numpyCameraArrays';
import { decomposePinholeProjection } from './projectionCamera';
import { dimension, finite, importError, positive } from './types';

export async function normalizeLlff(array: NumpyCameraArray, names: readonly string[], resolve: ResolveCameraFrame, signal?: AbortSignal) {
  if (array.columns !== 17 || names.length !== array.rows) return importError('INVALID_METADATA', 'LLFF requires an N by 17 array and one ordered photograph per camera.');
  const result = emptyCameraDataset('llff', array.rows);
  for (let index = 0; index < array.rows; index++) {
    if (index > 0 && index % 256 === 0) await new Promise<void>(done => setTimeout(done, 0));
    signal?.throwIfAborted();
    // The final two values are bounds; they do not participate in the camera or media model.
    const p = Array.from(array.values.subarray(index * 17, index * 17 + 15), (value, column) => finite(value, `poses[${index}][${column}]`));
    const width = dimension(p[9], 'LLFF width'), height = dimension(p[4], 'LLFF height'), focal = positive(p[14], 'LLFF focal');
    // Stored columns down/right/back -> OpenGL right/up/back; retain the original world frame.
    const pose = nerfCameraToColmap([[p[1], -p[0], p[2], p[3]], [p[6], -p[5], p[7], p[8]], [p[11], -p[10], p[12], p[13]], [0, 0, 0, 1]]);
    const resolved = await resolve(names[index], {}, index);
    if (resolved && !resolved.size) return importError('INVALID_CALIBRATION', `Cannot read dimensions for ${names[index]}.`);
    const size = resolved?.size ?? { width, height };
    const sx = size.width / width, sy = size.height / height;
    if (resolved && (sx !== 1 || sy !== 1)) result.diagnostics.push({ code: 'RESCALED_CALIBRATION', severity: 'info', frameIndex: index,
      message: `Scaled LLFF pixel intrinsics from ${width} by ${height} to ${size.width} by ${size.height}.` });
    addCameraFrame(result, index, resolved, pose, { modelId: CameraModelId.PINHOLE, ...size,
      params: [focal * sx, focal * sy, size.width / 2, size.height / 2].map((value, axis) => finite(value, `LLFF intrinsic ${axis}`)) }, names[index]);
  }
  return finishCameraDataset(result);
}

export function dtuCameraCount(arrays: ReadonlyMap<string, NumpyCameraArray>): number {
  const indices = [...arrays.keys()].filter(name => name.startsWith('world_mat_')).map(name => Number(name.slice('world_mat_'.length))).sort((a, b) => a - b);
  if (!indices.length || indices.some((id, index) => id !== index) || arrays.size !== indices.length * 2
    || indices.some(id => !arrays.has(`scale_mat_${id}`))) return importError('INVALID_METADATA', 'DTU cameras require consecutive world_mat_0/scale_mat_0 pairs starting at zero.');
  return indices.length;
}

export async function normalizeDtu(arrays: ReadonlyMap<string, NumpyCameraArray>, names: readonly string[],
  resolve: ResolveCameraFrame, signal?: AbortSignal, maskForImage?: (name: string) => string | undefined) {
  const count = dtuCameraCount(arrays);
  if (names.length !== count) return importError('INVALID_IMAGE_ORDER', 'DTU camera count does not match the image order.');
  const result = emptyCameraDataset('dtu', count);
  for (let index = 0; index < count; index++) {
    if (index > 0 && index % 256 === 0) await new Promise<void>(done => setTimeout(done, 0));
    signal?.throwIfAborted();
    const worldArray = arrays.get(`world_mat_${index}`)!, scaleArray = arrays.get(`scale_mat_${index}`)!;
    const world = Array.from(worldArray.values, value => finite(value, 'world_mat'));
    const scale = Array.from(scaleArray.values, value => finite(value, 'scale_mat'));
    if (scale.slice(12).some((value, column) => Math.abs(value - Number(column === 3)) > 1e-6)) return importError('INVALID_POSE', 'DTU scale_mat must be affine.');
    const factor = positive(Math.hypot(scale[0], scale[4], scale[8]), 'DTU normalization scale');
    validateRotation([0, 1, 2].map(row => [0, 1, 2].map(column => scale[row * 4 + column] / factor)), 'DTU normalization');
    const projection = Array.from({ length: 12 }, (_, at) => {
      const row = Math.floor(at / 4), column = at % 4;
      return [0, 1, 2, 3].reduce((sum, k) => sum + world[row * 4 + k] * scale[k * 4 + column], 0);
    });
    const relativeTolerance = worldArray.floatBytes === 4 || scaleArray.floatBytes === 4 ? 8 * 2 ** -23 : 1e-12;
    const { params, pose, skew } = decomposePinholeProjection(projection, relativeTolerance);
    if (Math.abs(skew) > 1e-10) result.diagnostics.push({ code: 'ROUNDED_CALIBRATION', severity: 'warning', frameIndex: index,
      message: `Removed ${skew.toPrecision(5)} pixels of projection skew within source floating-point precision; original camera arrays remain unchanged.` });
    const mask = maskForImage?.(names[index]);
    const resolved = await resolve(names[index], mask ? { mask_path: mask } : {}, index);
    if (!resolved) {
      result.diagnostics.push({ code: 'MISSING_RGB', severity: 'warning', frameIndex: index, path: names[index], message: `Missing RGB: ${names[index]}` });
      continue;
    }
    if (!resolved.size) return importError('INVALID_CALIBRATION', `Cannot read dimensions for ${names[index]}.`);
    if (mask && resolved.mask?.kind === 'file') resolved.mask = { ...resolved.mask, role: 'foreground', normalization: 'binary-luminance' };
    addCameraFrame(result, index, resolved, pose, { modelId: CameraModelId.PINHOLE, ...resolved.size, params }, names[index]);
  }
  return finishCameraDataset(result);
}
