/**
 * Minimal image headers carrying only the bytes that dimension readers inspect. They are
 * ArrayBuffer-backed, so they can be Blob and File parts.
 */
const ascii = (text: string) => [...text].map(char => char.charCodeAt(0));
const u16be = (value: number) => [(value >>> 8) & 255, value & 255];
const u32be = (value: number) => [...u16be(value >>> 16), ...u16be(value)];
const u16le = (value: number) => [value & 255, (value >>> 8) & 255];
const u24le = (value: number) => [...u16le(value), (value >>> 16) & 255];
const u32le = (value: number) => [...u16le(value), ...u16le(value >>> 16)];

export function pngHeader(width: number, height: number): Uint8Array<ArrayBuffer> {
  return new Uint8Array([0x89, ...ascii('PNG\r\n\x1a\n'), ...u32be(13), ...ascii('IHDR'), ...u32be(width), ...u32be(height), 8, 6, 0, 0, 0]);
}

/** SOI, an Exif APP1 segment the reader must skip, then SOF0 with the frame size. */
export function jpegHeader(width: number, height: number): Uint8Array<ArrayBuffer> {
  const app1 = [0xff, 0xe1, ...u16be(8), ...ascii('Exif'), 0, 0];
  const sof0 = [0xff, 0xc0, ...u16be(17), 8, ...u16be(height), ...u16be(width), 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1];
  return new Uint8Array([0xff, 0xd8, ...app1, ...sof0]);
}

/** Minimal little/big-endian TIFF IFD with scalar size and Exif orientation tags. */
export function tiffHeader(width: number, height: number, orientation = 1, little = true): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(50), view = new DataView(bytes.buffer);
  view.setUint16(0, little ? 0x4949 : 0x4d4d); view.setUint16(2, 42, little); view.setUint32(4, 8, little);
  view.setUint16(8, 3, little);
  for (const [index, [tag, value]] of [[256, width], [257, height], [274, orientation]].entries()) {
    const at = 10 + index * 12, type = tag === 274 ? 3 : 4;
    view.setUint16(at, tag, little); view.setUint16(at + 2, type, little); view.setUint32(at + 4, 1, little);
    if (type === 3) view.setUint16(at + 8, value, little); else view.setUint32(at + 8, value, little);
  }
  return bytes;
}

export function jpegExifHeader(width: number, height: number, orientation: number): Uint8Array<ArrayBuffer> {
  const exif = [...ascii('Exif\0\0'), ...tiffHeader(width, height, orientation)];
  // Replace jpegHeader's empty Exif segment, retaining its SOF frame.
  return new Uint8Array([0xff, 0xd8, 0xff, 0xe1, ...u16be(exif.length + 2), ...exif, ...jpegHeader(width, height).slice(12)]);
}

export function gifHeader(width: number, height: number): Uint8Array<ArrayBuffer> {
  return new Uint8Array([...ascii('GIF89a'), ...u16le(width), ...u16le(height), 0, 0, 0]);
}

export function bmpHeader(width: number, height: number): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(54), view = new DataView(bytes.buffer);
  bytes.set(ascii('BM')); view.setUint32(14, 40, true); view.setInt32(18, width, true); view.setInt32(22, height, true);
  return bytes;
}

export function webpHeader(kind: 'VP8' | 'VP8L' | 'VP8X', width: number, height: number): Uint8Array<ArrayBuffer> {
  const chunk = kind === 'VP8'
    ? [...ascii('VP8 '), ...u32le(10), 0x30, 0x01, 0x00, 0x9d, 0x01, 0x2a, ...u16le(width), ...u16le(height)]
    : kind === 'VP8L'
      ? [...ascii('VP8L'), ...u32le(5), 0x2f, ...u32le((width - 1) | ((height - 1) << 14))]
      : [...ascii('VP8X'), ...u32le(10), 0, 0, 0, 0, ...u24le(width - 1), ...u24le(height - 1)];
  return new Uint8Array([...ascii('RIFF'), ...u32le(4 + chunk.length), ...ascii('WEBP'), ...chunk]);
}
