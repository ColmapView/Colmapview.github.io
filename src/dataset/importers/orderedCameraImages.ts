import { readCameraSourceFile } from './sourceAccess';
import { imageResourceUrl, isCameraImagePath, parentPath } from './sourcePaths';
import { importError, MAX_CAMERA_METADATA_BYTES, MAX_CAMERA_FRAMES, type CameraDatasetSource } from './types';

/** Python's case-sensitive filename order, including filenames outside the BMP. */
function compareNames(left: string, right: string): number {
  const a = Array.from(left, char => char.codePointAt(0)!), b = Array.from(right, char => char.codePointAt(0)!);
  for (let index = 0; index < Math.min(a.length, b.length); index++) if (a[index] !== b[index]) return a[index] - b[index];
  return a.length - b.length;
}

/** Arrays omit names. An explicit list or a complete conventional image directory establishes order. */
export async function orderedCameraImages(source: CameraDatasetSource, metadataPath: string, count: number,
  directory: 'images' | 'image', signal?: AbortSignal): Promise<string[]> {
  if (!Number.isSafeInteger(count) || count <= 0 || count > MAX_CAMERA_FRAMES) return importError('IMPORT_LIMIT_EXCEEDED', 'Camera array has no views or too many views.');
  const root = parentPath(metadataPath), listPath = root ? root + '/list.txt' : 'list.txt';
  const paths = source.kind === 'local' ? source.files : source.kind === 'archive' ? source.entries
    : source.filePaths ? new Set(source.filePaths) : undefined;
  const list = !paths || paths.has(listPath) ? await readCameraSourceFile(source,
    source.kind === 'url' ? imageResourceUrl(source.baseUrl, listPath) : listPath, signal, MAX_CAMERA_METADATA_BYTES) : null;
  if (paths?.has(listPath) && !list) return importError('INVALID_IMAGE_ORDER', `The listed camera order file is unavailable: ${listPath}`);
  let names: string[];
  if (list) names = (await list.text()).replace(/^\uFEFF/, '').split(/\r?\n/).map(line => line.trim()).filter(line => line && !line.startsWith('#'));
  else if (paths) {
    const prefix = (root ? root + '/' : '') + directory + '/';
    names = [...paths.keys()].filter(path => path.startsWith(prefix) && !path.slice(prefix.length).includes('/') && isCameraImagePath(path))
      .sort(compareNames).map(path => root ? path.slice(root.length + 1) : path);
  } else return importError('INVALID_IMAGE_ORDER', 'Camera array URLs require list.txt beside the metadata, with one image path per row in camera order.');
  if (names.length !== count || new Set(names.map(name => name.toLowerCase())).size !== names.length) {
    return importError('INVALID_IMAGE_ORDER', `Camera array requires exactly ${count} distinct ordered image paths; found ${names.length}. Use list.txt to select a different image directory or preserve missing-file positions.`);
  }
  return names;
}
