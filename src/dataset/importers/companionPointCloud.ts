import { classifyPlyHeaderText, getPlyHeaderVertexCount, parsePointCloudPlyFile } from '../../parsers/plyPointCloud';
import type { ExplicitCameraPointCloud } from '../../types/cameraDatasetManifest';
import { numpyPointCloud } from './numpyPointCloud';
import { validateCloudTransform, xyzRgbPly } from './pointCloudFile';
import { readCameraSourceFile } from './sourceAccess';
import { imageResourceUrl, leafPath, parentPath, resolveSourcePath } from './sourcePaths';
import { importError, type CameraDatasetSource, type ImportDiagnostic } from './types';

const pointCloudName = /^(?:points_gt|points3d|points|point_cloud|sparse_pc)\.ply$/i;
const MAX_POINT_CLOUD_BYTES = 64 * 1024 * 1024;

/** Associate only a declared cloud or a unique, scene-local point-cloud filename. */
export async function readCompanionPointCloud(source: CameraDatasetSource, metadataPath: string,
  metadata: Record<string, unknown>, diagnostics: ImportDiagnostic[], signal?: AbortSignal,
  explicit?: ExplicitCameraPointCloud,
): Promise<{ file: File; sourcePath: string } | undefined> {
  const root = parentPath(metadataPath);
  const declared = explicit?.url ?? metadata.ply_file_path;
  let path: string | undefined;
  if (declared !== undefined) {
    path = resolveSourcePath(root, declared, root, source.kind === 'url', source.kind === 'url' ? source.baseUrl : undefined);
    if (!new RegExp(`\\.${explicit?.format === 'npz' ? 'npz' : 'ply'}(?:[?#]|$)`, 'i').test(path)) return importError('INVALID_POINT_CLOUD', 'Point selection must identify the declared PLY or NPZ format.');
  } else {
    const paths = source.kind === 'local' ? [...source.files.keys()] : source.kind === 'archive' ? [...source.entries.keys()] : source.filePaths;
    const candidates = paths?.filter(candidate => parentPath(candidate) === root && pointCloudName.test(leafPath(candidate))) ?? [];
    if (candidates.length > 1) {
      diagnostics.push({ code: 'AMBIGUOUS_POINT_CLOUD', severity: 'warning', path: root,
        message: 'Multiple companion point clouds are present. Set ply_file_path in the camera metadata to select one.' });
      return;
    }
    path = candidates[0];
  }
  if (path === undefined) return;
  let file = await readCameraSourceFile(source, path, signal, explicit?.format === 'npz' ? 16 * 1024 * 1024 : MAX_POINT_CLOUD_BYTES);
  if (!file) return importError('SOURCE_ACCESS_FAILED', `Companion point cloud is missing: ${path}`);
  if (explicit?.format === 'npz') file = await numpyPointCloud(new Uint8Array(await file.arrayBuffer()), explicit.array!, explicit.frame!, signal);
  const header = await file.slice(0, 1024 * 1024).text();
  signal?.throwIfAborted();
  if (classifyPlyHeaderText(header) !== 'point-cloud' || !getPlyHeaderVertexCount(header)
    || /(?:^|\n)element\s+face\s+[1-9]\d*\s*(?:\r?\n|$)/.test(header.slice(0, header.indexOf('end_header')))) {
    return importError('INVALID_POINT_CLOUD', `Companion geometry must be a nonempty XYZ point cloud, without mesh faces or Gaussian splat properties: ${path}`);
  }
  if (explicit?.transform) {
    const matrix = explicit.transform; validateCloudTransform(matrix);
    const points = await parsePointCloudPlyFile(file);
    let steps = 0;
    for (const point of points.values()) {
      if (++steps % 1024 === 0) await new Promise<void>(done => setTimeout(done, 0));
      signal?.throwIfAborted();
      const xyz = point.xyz;
      point.xyz = [0, 1, 2].map(row => matrix[row * 4] * xyz[0] + matrix[row * 4 + 1] * xyz[1] + matrix[row * 4 + 2] * xyz[2] + matrix[row * 4 + 3]) as [number, number, number];
    }
    file = xyzRgbPly(points.values(), points.size);
    diagnostics.push({code: 'TRANSFORMED_POINT_CLOUD', severity: 'info', path,
      message: 'Applied the explicit cloud-to-camera-world similarity to XYZ only. Camera poses are unchanged.'});
  }
  signal?.throwIfAborted();
  return { file, sourcePath: source.kind === 'url' ? imageResourceUrl(source.baseUrl, path) : path };
}
