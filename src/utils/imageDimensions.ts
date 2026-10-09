export interface ImageDimensions { width: number; height: number }
export interface ImageDimensionsOptions { applyOrientation?: boolean; signal?: AbortSignal }

const dimensions = (width: number, height: number): ImageDimensions | null => width > 0 && height > 0 ? { width, height } : null;
const ascii = (view: DataView, offset: number, length: number) =>
  String.fromCharCode(...new Uint8Array(view.buffer, view.byteOffset + offset, length));
const orient = (size: ImageDimensions | null, orientation: number) => size && orientation >= 5 && orientation <= 8
  ? { width: size.height, height: size.width } : size;

/** Only the first IFD's scalar size/orientation tags are needed; offsets and table size are bounded. */
async function readTiffMetadata(blob: Blob): Promise<{ size: ImageDimensions | null; orientation: number } | null> {
  const header = new DataView(await blob.slice(0, 8).arrayBuffer());
  if (header.byteLength < 8 || ![0x4949, 0x4d4d].includes(header.getUint16(0))) return null;
  const little = header.getUint16(0) === 0x4949;
  if (header.getUint16(2, little) !== 42) return null;
  const offset = header.getUint32(4, little);
  if (offset < 8 || offset + 2 > blob.size) return null;
  const count = new DataView(await blob.slice(offset, offset + 2).arrayBuffer()).getUint16(0, little);
  if (count > 4096 || offset + 2 + count * 12 > blob.size) return null;
  const fields = new DataView(await blob.slice(offset + 2, offset + 2 + count * 12).arrayBuffer());
  let width = 0, height = 0, orientation = 1;
  for (let entry = 0; entry < count; entry++) {
    const at = entry * 12, tag = fields.getUint16(at, little), type = fields.getUint16(at + 2, little);
    if (fields.getUint32(at + 4, little) !== 1 || type !== 3 && type !== 4) continue;
    const value = type === 3 ? fields.getUint16(at + 8, little) : fields.getUint32(at + 8, little);
    if (tag === 256) width = value;
    if (tag === 257) height = value;
    if (tag === 274 && value >= 1 && value <= 8) orientation = value;
  }
  return { size: dimensions(width, height), orientation };
}

/** PNG decoders read orientation metadata preceding the first pixel chunk. */
async function readPngOrientation(blob: Blob, signal?: AbortSignal): Promise<number> {
  let offset = 8;
  for (let chunks = 0; chunks < 1024 && offset + 8 <= blob.size; chunks++) {
    signal?.throwIfAborted();
    const chunk = new DataView(await blob.slice(offset, offset + 8).arrayBuffer());
    const size = chunk.getUint32(0), name = ascii(chunk, 4, 4);
    const end = offset + 8 + size;
    if (end > blob.size) break;
    // Browser PNG decoders establish orientation before reading IDAT, ignoring later Exif chunks.
    if (name === 'IDAT') break;
    if (name === 'eXIf') {
      return (await readTiffMetadata(blob.slice(offset + 8, end)))?.orientation ?? 1;
    }
    offset = end + 4;
  }
  return 1;
}

/** Walk JPEG segments to the frame header, reading only a few bytes per segment. */
async function readJpegDimensions(blob: Blob, options: ImageDimensionsOptions): Promise<ImageDimensions | null> {
  let offset = 2, orientation = 1;
  let frame: ImageDimensions | null = null;
  for (let segments = 0; segments < 1024 && offset + 9 <= blob.size; segments++) {
    options.signal?.throwIfAborted();
    const view = new DataView(await blob.slice(offset, offset + 9).arrayBuffer());
    if (view.getUint8(0) !== 0xff) return null;
    const marker = view.getUint8(1);
    if (marker === 0xff) { offset += 1; continue; } // Fill byte.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) { offset += 2; continue; } // Markers without a length.
    if (marker === 0xd9 || marker === 0xda) break;
    const length = view.getUint16(2);
    if (length < 2 || offset + 2 + length > blob.size) return null;
    // SOF0–SOF15 except DHT (C4), JPG (C8) and DAC (CC): precision, height, width.
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      if (length < 8) return null;
      frame = dimensions(view.getUint16(7), view.getUint16(5));
      if (!options.applyOrientation) return frame;
    }
    if (marker === 0xe1 && options.applyOrientation && length >= 8) {
      const prefix = new DataView(await blob.slice(offset + 4, offset + 10).arrayBuffer());
      if (ascii(prefix, 0, 6) === 'Exif\0\0') {
        orientation = (await readTiffMetadata(blob.slice(offset + 10, offset + 2 + length)))?.orientation ?? orientation;
      }
    }
    offset += 2 + length;
  }
  return options.applyOrientation ? orient(frame, orientation) : frame;
}

/** Read common raster headers without decoding pixels; orientation is opt-in for display previews. */
export async function readImageDimensions(blob: Blob, options: ImageDimensionsOptions = {}): Promise<ImageDimensions | null> {
  options.signal?.throwIfAborted();
  const head = new DataView(await blob.slice(0, 30).arrayBuffer());
  if (head.byteLength >= 24 && head.getUint32(0) === 0x89504e47 && ascii(head, 12, 4) === 'IHDR') {
    const size = dimensions(head.getUint32(16), head.getUint32(20));
    return options.applyOrientation ? orient(size, await readPngOrientation(blob, options.signal)) : size;
  }
  if (head.byteLength >= 16 && ascii(head, 0, 4) === 'RIFF' && ascii(head, 8, 4) === 'WEBP') {
    const chunk = ascii(head, 12, 4);
    if (chunk === 'VP8 ' && head.byteLength >= 30 && head.getUint8(23) === 0x9d && head.getUint8(24) === 0x01 && head.getUint8(25) === 0x2a) {
      return dimensions(head.getUint16(26, true) & 0x3fff, head.getUint16(28, true) & 0x3fff);
    }
    if (chunk === 'VP8L' && head.byteLength >= 25 && head.getUint8(20) === 0x2f) {
      const bits = head.getUint32(21, true);
      return dimensions((bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1);
    }
    if (chunk === 'VP8X' && head.byteLength >= 30) {
      return dimensions((head.getUint16(24, true) | (head.getUint8(26) << 16)) + 1, (head.getUint16(27, true) | (head.getUint8(29) << 16)) + 1);
    }
    return null;
  }
  if (head.byteLength >= 2 && head.getUint16(0) === 0xffd8) return readJpegDimensions(blob, options);
  if (head.byteLength >= 10 && ['GIF87a', 'GIF89a'].includes(ascii(head, 0, 6))) {
    return dimensions(head.getUint16(6, true), head.getUint16(8, true));
  }
  if (head.byteLength >= 26 && ascii(head, 0, 2) === 'BM') {
    const dibSize = head.getUint32(14, true);
    if (dibSize === 12) return dimensions(head.getUint16(18, true), head.getUint16(20, true));
    if (dibSize >= 40) return dimensions(head.getInt32(18, true), Math.abs(head.getInt32(22, true)));
  }
  if (head.byteLength >= 8 && [0x4949, 0x4d4d].includes(head.getUint16(0))) {
    const metadata = await readTiffMetadata(blob);
    return metadata ? options.applyOrientation ? orient(metadata.size, metadata.orientation) : metadata.size : null;
  }
  return null;
}
