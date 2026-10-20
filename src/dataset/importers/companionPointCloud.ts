import { classifyPlyHeaderText, getPlyHeaderVertexCount } from '../../parsers/plyPointCloud';
import { readCameraSourceFile } from './sourceAccess';
import { imageResourceUrl, leafPath, parentPath, resolveSourcePath } from './sourcePaths';
import { importError, type CameraDatasetSource, type ImportDiagnostic } from './types';

const pointCloudName = /^(?:points_gt|points3d|points|point_cloud|sparse_pc)\.ply$/i;
const MAX_POINT_CLOUD_BYTES = 64 * 1024 * 1024;

/** Associate only a declared cloud or a unique, scene-local point-cloud filename. */
export async function readCompanionPointCloud(source: CameraDatasetSource, metadataPath: string,
  metadata: Record<string, unknown>, diagnostics: ImportDiagnostic[], signal?: AbortSignal,
): Promise<{ file: File; sourcePath: string } | undefined> {
  const root = parentPath(metadataPath);
  const declared = metadata.ply_file_path;
  let path: string | undefined;
  if (declared !== undefined) {
    path = resolveSourcePath(root, declared, root, source.kind === 'url', source.kind === 'url' ? source.baseUrl : undefined);
    if (!/\.ply(?:[?#]|$)/i.test(path)) return importError('INVALID_POINT_CLOUD', 'ply_file_path must identify a PLY point cloud.');
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
  const file = await readCameraSourceFile(source, path, signal, MAX_POINT_CLOUD_BYTES);
  if (!file) return importError('SOURCE_ACCESS_FAILED', `Companion point cloud is missing: ${path}`);
  const header = await file.slice(0, 1024 * 1024).text();
  signal?.throwIfAborted();
  if (classifyPlyHeaderText(header) !== 'point-cloud' || !getPlyHeaderVertexCount(header)
    || /(?:^|\n)element\s+face\s+[1-9]\d*\s*(?:\r?\n|$)/.test(header.slice(0, header.indexOf('end_header')))) {
    return importError('INVALID_POINT_CLOUD', `Companion geometry must be a nonempty XYZ point cloud, without mesh faces or Gaussian splat properties: ${path}`);
  }
  return { file, sourcePath: source.kind === 'url' ? imageResourceUrl(source.baseUrl, path) : path };
}
