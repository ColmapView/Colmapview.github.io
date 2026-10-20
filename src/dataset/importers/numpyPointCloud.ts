import { unzipSync } from 'fflate';
import { IndexedZipBackend } from '../../archive/indexedZip';
import { readNumpyCameraArray } from './numpyCameraArrays';
import { importError, MAX_CAMERA_METADATA_BYTES } from './types';
import { xyzRgbPly } from './pointCloudFile';

/** Explicit numeric frame only: no pickle, code evaluation, topology or automatic timeline merging. */
export async function numpyPointCloud(bytes: Uint8Array, array: string, frame: number, signal = new AbortController().signal): Promise<File> {
  if (bytes.length > MAX_CAMERA_METADATA_BYTES) return importError('IMPORT_LIMIT_EXCEEDED', 'Vertex NPZ exceeds 16 MiB.');
  let matches = 0;
  unzipSync(bytes, { filter: entry => {
    if (entry.name !== array + '.npy') return false;
    if (++matches !== 1 || entry.originalSize > MAX_CAMERA_METADATA_BYTES) return importError('IMPORT_LIMIT_EXCEEDED', 'Ambiguous or oversized vertex array.');
    return false;
  } });
  if (!matches) return importError('INVALID_POINT_CLOUD', 'The selected vertex array is absent.');
  const backend = new IndexedZipBackend({name: 'vertices.npz', size: bytes.length,
    async read(offset, length) { signal.throwIfAborted(); return bytes.slice(offset, offset + length); }});
  let source: Uint8Array;
  try {
    const entries = await backend.list(signal), entry = entries.find(item => item.path === array + '.npy');
    if (!entry || entry.size > MAX_CAMERA_METADATA_BYTES) return importError('IMPORT_LIMIT_EXCEEDED', 'Vertex array exceeds its read budget.');
    source = new Uint8Array(await (await backend.extract(entry.path, signal)).arrayBuffer());
  } finally { await backend.close(); }
  signal.throwIfAborted();
  // Reuse the strict numeric NPY parser by selecting a C-order (frames, vertices, 3) slab.
  if (source.length < 12) return importError('INVALID_POINT_CLOUD', 'Truncated vertex NPY.');
  const view = new DataView(source.buffer, source.byteOffset, source.byteLength);
  const offset = source[6] === 1 ? 10 : 12, length = source[6] === 1 ? view.getUint16(8, true) : view.getUint32(8, true);
  if (length > 4096 || offset + length > source.length) return importError('INVALID_POINT_CLOUD', 'Invalid vertex NPY header.');
  const header = new TextDecoder().decode(source.subarray(offset, offset + length));
  const shape = /(['"])shape\1\s*:\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*3\s*,?\s*\)/.exec(header);
  const dtype = /(['"])descr\1\s*:\s*(['"])[<>=]f([48])\2/.exec(header);
  if (!shape || !dtype || !/(['"])fortran_order\1\s*:\s*False/.test(header)) return importError('INVALID_POINT_CLOUD', 'Vertices require a C-order float array shaped (frames, vertices, 3).');
  const frames = Number(shape[2]), count = Number(shape[3]), slab = count * 3 * Number(dtype[3]);
  if (!Number.isSafeInteger(frame) || frame < 0 || frame >= frames || !count || frames * slab !== source.length - offset - length) {
    return importError('INVALID_POINT_CLOUD', 'Vertex frame or payload does not match its declared shape.');
  }
  const selectedHeader = header.replace(shape[0], `'shape': (${count}, 3)`).trimEnd() + '\n';
  const encoded = new TextEncoder().encode(selectedHeader), selected = new Uint8Array(offset + encoded.length + slab);
  selected.set(source.subarray(0, offset));
  const selectedView = new DataView(selected.buffer);
  if (offset === 10) selectedView.setUint16(8, encoded.length, true); else selectedView.setUint32(8, encoded.length, true);
  selected.set(encoded, offset); selected.set(source.subarray(offset + length + frame * slab, offset + length + (frame + 1) * slab), offset + encoded.length);
  const numeric = readNumpyCameraArray(selected);
  function* points() {
    for (let index = 0; index < numeric.rows; index++) yield { xyz: Array.from(numeric.values.subarray(index * 3, index * 3 + 3)) as [number, number, number], rgb: [255, 255, 255] as [number, number, number] };
  }
  return xyzRgbPly(points(), count);
}
