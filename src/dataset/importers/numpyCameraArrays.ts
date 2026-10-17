import { unzipSync } from 'fflate';
import { IndexedZipBackend } from '../../archive/indexedZip';
import { validateByteRange } from '../../archive/byteSource';
import { CameraDatasetImportError, importError, MAX_CAMERA_METADATA_BYTES, MAX_CAMERA_FRAMES } from './types';

export interface NumpyCameraArray { rows: number; columns: number; values: Float64Array; floatBytes: 4 | 8 }

/** Numeric two-dimensional NPY only. Python expressions and pickle/object arrays are never evaluated. */
export function readNumpyCameraArray(bytes: Uint8Array): NumpyCameraArray {
  if (bytes.byteLength > MAX_CAMERA_METADATA_BYTES) return importError('IMPORT_LIMIT_EXCEEDED', 'Camera array exceeds 16 MiB.');
  if (bytes.length < 10 || bytes[0] !== 0x93 || new TextDecoder().decode(bytes.subarray(1, 6)) !== 'NUMPY') {
    return importError('INVALID_METADATA', 'Invalid NPY camera array signature.');
  }
  const major = bytes[6], minor = bytes[7];
  if (![1, 2, 3].includes(major) || minor !== 0) return importError('INVALID_METADATA', 'Unsupported NPY format version.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const offset = major === 1 ? 10 : 12;
  if (bytes.length < offset) return importError('INVALID_METADATA', 'Truncated NPY header.');
  const length = major === 1 ? view.getUint16(8, true) : view.getUint32(8, true);
  if (!length || length > 4096 || offset + length > bytes.length) return importError('INVALID_METADATA', 'Invalid or oversized NPY header.');
  let header = new TextDecoder().decode(bytes.subarray(offset, offset + length));
  if (!header.endsWith('\n')) return importError('INVALID_METADATA', 'NPY header must end with a newline.');
  const take = (pattern: RegExp, capture = 1): string => {
    const matches = [...header.matchAll(pattern)];
    if (matches.length !== 1) return importError('INVALID_METADATA', 'Invalid or repeated NPY header field.');
    header = header.replace(pattern, '@');
    return matches[0][capture];
  };
  const dtype = take(/(?:'descr'|"descr")\s*:\s*(['"])([^'"]+)\1/g, 2);
  const fortran = take(/(?:'fortran_order'|"fortran_order")\s*:\s*(True|False)/g) === 'True';
  const shape = take(/(?:'shape'|"shape")\s*:\s*\((\s*\d+\s*,\s*\d+\s*,?\s*)\)/g);
  if (!/^\s*\{\s*@\s*,\s*@\s*,\s*@\s*,?\s*\}\s*$/.test(header) || !/^[<>=]f[48]$/.test(dtype)) {
    return importError('INVALID_METADATA', 'Only plain float32/float64 camera arrays are supported; object/pickle and structured arrays are unsupported.');
  }
  const [rows, columns] = shape.split(',').map(part => part.trim()).filter(Boolean).map(Number);
  const size = Number(dtype[2]), count = rows * columns, start = offset + length;
  if (!rows || !columns || !Number.isSafeInteger(count) || count > MAX_CAMERA_METADATA_BYTES / size) {
    return importError('IMPORT_LIMIT_EXCEEDED', 'Invalid or oversized NPY camera shape.');
  }
  if (count * size !== bytes.length - start) return importError('INVALID_METADATA', 'NPY camera payload size does not match its shape.');
  const littleEndian = dtype[0] === '<' || dtype[0] === '=' && new Uint8Array(new Uint16Array([1]).buffer)[0] === 1;
  const values = new Float64Array(count);
  for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
    const at = start + (fortran ? column * rows + row : row * columns + column) * size;
    values[row * columns + column] = size === 4 ? view.getFloat32(at, littleEndian) : view.getFloat64(at, littleEndian);
  }
  return { rows, columns, values, floatBytes: size as 4 | 8 };
}

/** Read only world/scale camera matrices. Other arrays, including depth, remain compressed. */
export async function readDtuCameraArchive(bytes: Uint8Array, signal = new AbortController().signal): Promise<Map<string, NumpyCameraArray>> {
  signal.throwIfAborted();
  if (bytes.byteLength > MAX_CAMERA_METADATA_BYTES) return importError('IMPORT_LIMIT_EXCEEDED', 'Camera NPZ exceeds 16 MiB.');
  let expanded = 0;
  const seen = new Set<string>();
  const backend = new IndexedZipBackend({ name: 'cameras.npz', size: bytes.length, async read(offset, length) {
    validateByteRange(bytes.length, offset, length);
    return new Uint8Array(bytes.subarray(offset, offset + length));
  } });
  try {
    // Inspect names/sizes without inflating. The shared ZIP backend checks CRC and actual output sizes.
    unzipSync(bytes, { filter: entry => {
      signal.throwIfAborted();
      if (!/^(?:world|scale)_mat_\d+\.npy$/.test(entry.name)) return false;
      if (!/^(?:world|scale)_mat_(?:0|[1-9]\d*)\.npy$/.test(entry.name) || seen.has(entry.name)) {
        return importError('INVALID_METADATA', 'Duplicate or ambiguous NPZ camera matrix name.');
      }
      seen.add(entry.name);
      expanded += entry.originalSize;
      if (entry.originalSize > 8192 || expanded > MAX_CAMERA_METADATA_BYTES || seen.size > MAX_CAMERA_FRAMES * 2) {
        return importError('IMPORT_LIMIT_EXCEEDED', 'Expanded NPZ camera matrices exceed their read budget.');
      }
      return false;
    } });
    const available = new Set((await backend.list(signal)).map(entry => entry.path));
    const arrays = new Map<string, NumpyCameraArray>();
    for (const name of seen) {
      signal.throwIfAborted();
      if (!available.has(name)) return importError('INVALID_METADATA', 'Camera NPZ index contains inconsistent names.');
      const file = await backend.extract(name, signal);
      const array = readNumpyCameraArray(new Uint8Array(await file.arrayBuffer()));
      if (array.rows !== 4 || array.columns !== 4) return importError('INVALID_METADATA', `${name} must be a 4 by 4 matrix.`);
      arrays.set(name.replace(/\.npy$/, ''), array);
    }
    return arrays;
  } catch (error) {
    if (error instanceof CameraDatasetImportError || error instanceof Error && error.name === 'AbortError') throw error;
    return importError('INVALID_METADATA', 'Invalid or unsupported camera NPZ archive.');
  } finally { await backend.close(); }
}
