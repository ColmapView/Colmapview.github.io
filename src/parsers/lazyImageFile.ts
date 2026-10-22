import { parseImagesBinary } from './images';
import type { Point2D } from '../types/colmap';
import { BinaryReader } from './BinaryReader';
import type { ObservationVisitor } from './observationIntegrity';

export interface ObservationRange { offset: number; count: number }

/** Index an already retained native buffer without loading observations into WASM. */
export function indexImageBuffer(buffer: ArrayBuffer): Map<number, ObservationRange> {
  const reader = new BinaryReader(buffer), ranges = new Map<number, ObservationRange>();
  const count = reader.readUint64AsNumber();
  if (!Number.isSafeInteger(count) || count * 73 + 8 > buffer.byteLength) throw new Error('Invalid binary image count');
  for (let i = 0; i < count; i++) {
    const id = reader.readUint32();
    reader.skip(60); reader.readString();
    const observations = reader.readUint64AsNumber();
    if (!Number.isSafeInteger(observations) || observations > 0xffffffff || observations * 24 > reader.remaining || ranges.has(id)) {
      throw new Error('Invalid binary image observation bounds or duplicate image ID');
    }
    ranges.set(id, { offset: reader.position, count: observations });
    reader.skip(observations * 24);
  }
  if (reader.remaining !== 0) throw new Error('Unexpected trailing binary image data');
  return ranges;
}

export function visitObservationBuffer(buffer: ArrayBuffer, range: ObservationRange, visit: ObservationVisitor): void {
  const view = new DataView(buffer, range.offset, range.count * 24);
  for (let i = 0; i < range.count; i++) visit(i, view.getBigInt64(i * 24 + 16, true), view.getFloat64(i * 24, true), view.getFloat64(i * 24 + 8, true));
}

/** Fixed-size original-byte reads; does not populate or grow WASM's lazy cache. */
export function visitImageObservations(file: Blob, range: ObservationRange, read: (slice: Blob) => ArrayBuffer, visit: ObservationVisitor): void {
  const batch = 65536;
  for (let start = 0; start < range.count; start += batch) {
    const count = Math.min(batch, range.count - start), offset = range.offset + start * 24;
    const buffer = read(file.slice(offset, offset + count * 24));
    if (buffer.byteLength !== count * 24) throw new Error('Truncated original image observations');
    visitObservationBuffer(buffer, { offset: 0, count }, (i, id, x, y) => visit(start + i, id, x, y));
  }
}

/** Keep original observations in the Blob; only pose headers enter WASM memory. */
export async function indexImageFile(file: Blob) {
  const read = (start: number, end: number) => file.slice(start, end).arrayBuffer().catch(error => {
    throw new Error(`Could not read binary pose metadata at byte ${start}: ${error instanceof Error ? error.message : String(error)}`);
  });
  const countBytes = await read(0, 8);
  if (countBytes.byteLength !== 8) throw new Error('Truncated binary image count');
  const count = Number(new DataView(countBytes).getBigUint64(0, true));
  if (!Number.isSafeInteger(count) || count < 1 || count * 73 + 8 > file.size) throw new Error('Invalid binary image count');
  const parts: Uint8Array<ArrayBuffer>[] = [new Uint8Array(countBytes)];
  const ranges = new Map<number, ObservationRange>();
  let offset = 8, metadataBytes = 8;
  for (let index = 0; index < count; index++) {
    let bytes = new Uint8Array(await read(offset, offset + 4096));
    let end = bytes.indexOf(0, 64);
    if (end < 0 || end + 9 > bytes.length) {
      bytes = new Uint8Array(await read(offset, offset + 1024 * 1024));
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
  visitImageObservations(file, range, read, (_i, point3DId, x, y) => points.push({ xy: [x, y], point3DId }));
  return points;
}
