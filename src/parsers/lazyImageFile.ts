import { parseImagesBinary } from './images';
import type { Point2D } from '../types/colmap';

export interface ObservationRange { offset: number; count: number }

/** Keep original observations in the Blob; only pose headers enter WASM memory. */
export async function indexImageFile(file: Blob) {
  const countBytes = await file.slice(0, 8).arrayBuffer();
  if (countBytes.byteLength !== 8) throw new Error('Truncated binary image count');
  const count = Number(new DataView(countBytes).getBigUint64(0, true));
  if (!Number.isSafeInteger(count) || count < 1 || count * 73 + 8 > file.size) throw new Error('Invalid binary image count');
  const parts: Uint8Array<ArrayBuffer>[] = [new Uint8Array(countBytes)];
  const ranges = new Map<number, ObservationRange>();
  let offset = 8, metadataBytes = 8;
  for (let index = 0; index < count; index++) {
    let bytes = new Uint8Array(await file.slice(offset, offset + 4096).arrayBuffer());
    let end = bytes.indexOf(0, 64);
    if (end < 0 || end + 9 > bytes.length) {
      bytes = new Uint8Array(await file.slice(offset, offset + 1024 * 1024).arrayBuffer());
      end = bytes.indexOf(0, 64);
    }
    if (end < 65 || end + 9 > bytes.length) throw new Error('Truncated or oversized binary image name');
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const id = view.getUint32(0, true), observations = Number(view.getBigUint64(end + 1, true));
    const dataOffset = offset + end + 9, next = dataOffset + observations * 24;
    if (!Number.isSafeInteger(observations) || observations > 0xffffffff || !Number.isSafeInteger(next) || next > file.size || ranges.has(id)) {
      throw new Error('Invalid binary image observation bounds or duplicate image ID');
    }
    const header = bytes.slice(0, end + 9);
    new DataView(header.buffer).setBigUint64(end + 1, 0n, true);
    parts.push(header);
    metadataBytes += header.length;
    if (metadataBytes > 128 * 1024 * 1024) throw new Error('Binary pose metadata exceeds the 128 MiB index budget');
    ranges.set(id, { offset: dataOffset, count: observations });
    offset = next;
  }
  if (offset !== file.size) throw new Error('Unexpected trailing binary image data');
  const buffer = new Uint8Array(metadataBytes);
  let position = 0;
  for (const part of parts) { buffer.set(part, position); position += part.length; }
  const images = parseImagesBinary(buffer.buffer, true);
  for (const [id, image] of images) image.numPoints2D = ranges.get(id)!.count;
  return { buffer: buffer.buffer, images, ranges };
}

/** Read one original observation block in the reconstruction's dedicated worker. */
export function readImageObservations(file: Blob, range: ObservationRange, read: (slice: Blob) => ArrayBuffer): Point2D[] {
  const points: Point2D[] = [];
  // Bound each read even when one image itself contains many observations.
  const batch = 65536;
  for (let start = 0; start < range.count; start += batch) {
    const count = Math.min(batch, range.count - start), offset = range.offset + start * 24;
    const buffer = read(file.slice(offset, offset + count * 24));
    if (buffer.byteLength !== count * 24) throw new Error('Truncated original image observations');
    const view = new DataView(buffer);
    for (let index = 0; index < count; index++) points.push({
      xy: [view.getFloat64(index * 24, true), view.getFloat64(index * 24 + 8, true)],
      point3DId: view.getBigInt64(index * 24 + 16, true),
    });
  }
  return points;
}
