import { Quaternion, Vector3 } from 'three';
import { getCameraIntrinsics } from '../../utils/cameraIntrinsics';
import { distortNormalized } from '../../utils/cameraUndistortion';
import { openSfmPointIds } from './openSfmPoints';
import { readCameraSourceFile } from './sourceAccess';
import { leafPath, parentPath } from './sourcePaths';
import { importError, MAX_CAMERA_METADATA_BYTES, object, type CameraDatasetSource, type NormalizedCameraDataset, type ImportDiagnostic } from './types';

/** Native tab-separated tracks, versions 0, 1 and 2 (despite the .csv suffix). */
export async function addOpenSfmTracks(root: Record<string, unknown>, result: NormalizedCameraDataset, text: string, signal?: AbortSignal): Promise<void> {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
  let version = 0;
  if (lines[0]?.startsWith('OPENSFM_TRACKS_VERSION')) {
    const match = /^OPENSFM_TRACKS_VERSION_v([012])$/.exec(lines.shift()!);
    if (!match) return importError('INVALID_METADATA', 'Unsupported OpenSfM tracks version.');
    version = Number(match[1]);
  }
  const shots = new Map(Object.keys(object(root.shots, 'shots')).map((id, index) => [id, result.images.get(index + 1)]));
  const pointIds = openSfmPointIds(root.points);
  const observations = new Map<number, Map<number, { track: string; x: number; y: number }>>();
  const seenTracks = new Map<number, Set<string>>();
  let steps = 0, omitted = 0;
  for (const line of lines) {
    if (++steps % 1024 === 0) await new Promise<void>(done => setTimeout(done, 0));
    signal?.throwIfAborted();
    if (!line.trim()) continue;
    const fields = line.split('\t'), expected = [8, 9, 11][version];
    if (fields.length !== expected || !fields[0] || !fields[1] || fields.slice(2).some(value => !value.trim() || !Number.isFinite(Number(value)))) return importError('INVALID_METADATA', 'Malformed OpenSfM track observation.');
    const feature = Number(fields[2]), x = Number(fields[3]), y = Number(fields[4]), colorOffset = version === 0 ? 5 : 6;
    if (!Number.isSafeInteger(feature) || feature < 0 || fields.slice(colorOffset, colorOffset + 3).some(value => !Number.isInteger(Number(value)) || Number(value) < 0 || Number(value) > 255)) return importError('INVALID_METADATA', 'Invalid OpenSfM feature ID or RGB bytes.');
    const image = shots.get(fields[0]);
    if (!image) { omitted++; continue; }
    let features = observations.get(image.imageId), tracks = seenTracks.get(image.imageId);
    if (!features) { features = new Map(); observations.set(image.imageId, features); tracks = new Set(); seenTracks.set(image.imageId, tracks); }
    if (features.has(feature) || tracks!.has(fields[1])) return importError('INVALID_METADATA', 'Duplicate OpenSfM feature or shot/track observation.');
    features.set(feature, { track: fields[1], x, y }); tracks!.add(fields[1]);
  }
  const errors = new Map<bigint, { total: number; count: number }>();
  for (const image of result.images.values()) {
    const camera = result.cameras.get(image.cameraId)!, intrinsics = getCameraIntrinsics(camera);
    const rotation = new Quaternion(image.qvec[1], image.qvec[2], image.qvec[3], image.qvec[0]), translation = new Vector3(...image.tvec);
    for (const [, observation] of [...observations.get(image.imageId) ?? []].sort(([a], [b]) => a - b)) {
      if (++steps % 1024 === 0) await new Promise<void>(done => setTimeout(done, 0));
      signal?.throwIfAborted();
      // OpenSfM normalized OpenCV pixel+0.5; COLMAP already uses half-integer centers.
      const size = Math.max(camera.width, camera.height), xy: [number, number] = [observation.x * size + camera.width / 2, observation.y * size + camera.height / 2];
      if (xy.some(value => !Number.isFinite(value))) return importError('INVALID_METADATA', 'OpenSfM observation exceeds finite pixel coordinates.');
      const id = pointIds.get(observation.track), point = id === undefined ? undefined : result.points3D?.get(id);
      const index = image.points2D.length;
      image.points2D.push({ xy, point3DId: point?.point3DId ?? -1n });
      if (!point) continue;
      point.track.push({ imageId: image.imageId, point2DIdx: index });
      const cp = new Vector3(...point.xyz).applyQuaternion(rotation).add(translation);
      if (cp.z <= 0) continue;
      const distorted = distortNormalized({ x: cp.x / cp.z, y: cp.y / cp.z }, intrinsics, camera.modelId);
      const error = Math.hypot(distorted.x * intrinsics.fx + intrinsics.cx - xy[0], distorted.y * intrinsics.fy + intrinsics.cy - xy[1]);
      if (Number.isFinite(error)) {
        const entry = errors.get(point.point3DId) ?? { total: 0, count: 0 };
        entry.total += error; entry.count++; errors.set(point.point3DId, entry);
      }
    }
  }
  for (const [id, entry] of errors) result.points3D!.get(id)!.error = entry.total / entry.count;
  result.diagnostics = result.diagnostics.filter(item => item.code !== 'UNTRACKED_STRUCTURE');
  result.diagnostics.push({ code: 'IMPORTED_TRACKS', severity: 'info', message: 'Imported OpenSfM feature observations and reciprocal tracks; pixel reprojection errors are computed from retained observations.' });
  if (omitted) result.diagnostics.push({ code: 'OMITTED_POINT_OBSERVATIONS', severity: 'info', message: `Skipped ${omitted} observations outside the selected reconstruction's imported shots.` });
}

export async function readOpenSfmTracks(source: CameraDatasetSource, metadataPath: string, explicit: string | undefined, signal?: AbortSignal, diagnostics?: ImportDiagnostic[]): Promise<File | null> {
  const match = /^reconstruction([_.-][A-Za-z0-9_-]+)?\.json$/i.exec(leafPath(metadataPath));
  const path = explicit ?? (match ? (parentPath(metadataPath) ? parentPath(metadataPath) + '/' : '') + `tracks${match[1] ?? ''}.csv` : undefined);
  if (!path) return null;
  if (!explicit && source.kind==='url' && source.filePaths && !source.filePaths.includes(path)) return null;
  let file: File | null;
  try { file = await readCameraSourceFile(source, path, signal, MAX_CAMERA_METADATA_BYTES); }
  catch (error) {
    signal?.throwIfAborted();
    if (explicit || error instanceof Error && error.name==='AbortError') throw error;
    diagnostics?.push({code:'UNAVAILABLE_TRACKS',severity:'warning',path,message:'Optional OpenSfM tracks could not be read. Source XYZ/RGB is retained without those observations; an explicit tracksUrl makes the sidecar required.'});
    return null;
  }
  if (!file && explicit) return importError('SOURCE_ACCESS_FAILED', 'Declared OpenSfM tracks are missing.');
  return file;
}
