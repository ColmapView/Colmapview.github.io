import type { Point3D, Point3DId } from '../../types/colmap';
import { importError, object, type NormalizedCameraDataset } from './types';

export function openSfmPointIds(value: unknown): Map<string, bigint> {
  const ids = value === undefined ? [] : Object.keys(object(value, 'OpenSfM points'));
  const numeric = ids.every(id => /^(?:0|[1-9]\d*)$/.test(id) && id.length <= 20 && BigInt(id) < 0xffffffffffffffffn);
  if (!numeric) ids.sort();
  return new Map(ids.map((id, index) => [id, numeric ? BigInt(id) : BigInt(index + 1)]));
}

/** reconstruction.json stores XYZ/RGB; feature tracks live in separate OpenSfM files. */
export async function addOpenSfmPoints(value: unknown, result: NormalizedCameraDataset, signal?: AbortSignal): Promise<void> {
  if (value === undefined) return;
  const rows=Object.entries(object(value,'OpenSfM points'));
  const numericIds=rows.every(([id]) => /^(?:0|[1-9]\d*)$/.test(id) && id.length <= 20 && BigInt(id) < 0xffffffffffffffffn);
  // OpenSfM permits arbitrary string IDs. Reindex the complete set when needed,
  // rather than risking collisions with numeric IDs or losing uint64 precision.
  if (!numericIds) rows.sort(([a],[b]) => a < b ? -1 : a > b ? 1 : 0);
  const points=new Map<Point3DId,Point3D>();
  for (const [index,[id,raw]] of rows.entries()) {
    if (index > 0 && index % 1024 === 0) await new Promise<void>(done => setTimeout(done,0));
    signal?.throwIfAborted();
    const row=object(raw,`OpenSfM point ${id}`);
    const xyz=row.coordinates, rgb=row.color;
    if (!Array.isArray(xyz) || xyz.length !== 3 || xyz.some(v => typeof v !== 'number' || !Number.isFinite(v))) {
      return importError('INVALID_METADATA',`OpenSfM point ${id} must have three finite coordinates.`);
    }
    if (!Array.isArray(rgb) || rgb.length !== 3 || rgb.some(v => typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > 255)) {
      return importError('INVALID_METADATA',`OpenSfM point ${id} must have three RGB bytes.`);
    }
    const point3DId=numericIds ? BigInt(id) : BigInt(index+1);
    points.set(point3DId,{point3DId,xyz:xyz as [number,number,number],rgb:rgb as [number,number,number],error:0,track:[]});
  }
  signal?.throwIfAborted();
  result.points3D=points;
  if (points.size) result.diagnostics.push({code:'UNTRACKED_STRUCTURE',severity:'info',
    message:'OpenSfM XYZ and RGB are retained. This JSON has no feature observations or pixel reprojection errors; tracks are empty and unavailable errors use zero.'});
  if (!numericIds) result.diagnostics.push({code:'REINDEXED_POINT_IDS',severity:'info',
    message:'OpenSfM string point IDs are reindexed in lexical order to unique COLMAP integer IDs.'});
}
