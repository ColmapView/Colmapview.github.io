export interface ImageDimensions { width: number; height: number }

const dimensions = (width: number, height: number): ImageDimensions | null => width > 0 && height > 0 ? { width, height } : null;
const ascii = (view: DataView, offset: number, length: number) =>
  String.fromCharCode(...new Uint8Array(view.buffer, view.byteOffset + offset, length));

/** Walk JPEG segments to the frame header, reading only a few bytes per segment. */
async function readJpegDimensions(blob: Blob): Promise<ImageDimensions | null> {
  let offset = 2;
  for (let segments = 0; segments < 1024 && offset + 9 <= blob.size; segments++) {
    const view = new DataView(await blob.slice(offset, offset + 9).arrayBuffer());
    if (view.getUint8(0) !== 0xff) return null;
    const marker = view.getUint8(1);
    if (marker === 0xff) { offset += 1; continue; } // Fill byte.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) { offset += 2; continue; } // Markers without a length.
    if (marker === 0xd9 || marker === 0xda) return null; // Image data before any frame header.
    // SOF0–SOF15 except DHT (C4), JPG (C8) and DAC (CC): precision, height, width.
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return dimensions(view.getUint16(7), view.getUint16(5));
    }
    offset += 2 + view.getUint16(2);
  }
  return null;
}

/** Read PNG, JPEG or WebP dimensions from headers without decoding any pixels. */
export async function readImageDimensions(blob: Blob): Promise<ImageDimensions | null> {
  const head = new DataView(await blob.slice(0, 30).arrayBuffer());
  if (head.byteLength >= 24 && head.getUint32(0) === 0x89504e47 && ascii(head, 12, 4) === 'IHDR') {
    return dimensions(head.getUint32(16), head.getUint32(20));
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
  if (head.byteLength >= 2 && head.getUint16(0) === 0xffd8) return readJpegDimensions(blob);
  return null;
}
