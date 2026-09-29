/** Minimal image headers carrying only the bytes that dimension readers inspect. */
const ascii = (text: string) => [...text].map(char => char.charCodeAt(0));
const u16be = (value: number) => [(value >>> 8) & 255, value & 255];
const u32be = (value: number) => [...u16be(value >>> 16), ...u16be(value)];
const u16le = (value: number) => [value & 255, (value >>> 8) & 255];
const u24le = (value: number) => [...u16le(value), (value >>> 16) & 255];
const u32le = (value: number) => [...u16le(value), ...u16le(value >>> 16)];

export function pngHeader(width: number, height: number): Uint8Array {
  return new Uint8Array([0x89, ...ascii('PNG\r\n\x1a\n'), ...u32be(13), ...ascii('IHDR'), ...u32be(width), ...u32be(height), 8, 6, 0, 0, 0]);
}

/** SOI, an Exif APP1 segment the reader must skip, then SOF0 with the frame size. */
export function jpegHeader(width: number, height: number): Uint8Array {
  const app1 = [0xff, 0xe1, ...u16be(8), ...ascii('Exif'), 0, 0];
  const sof0 = [0xff, 0xc0, ...u16be(17), 8, ...u16be(height), ...u16be(width), 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1];
  return new Uint8Array([0xff, 0xd8, ...app1, ...sof0]);
}

export function webpHeader(kind: 'VP8' | 'VP8L' | 'VP8X', width: number, height: number): Uint8Array {
  const chunk = kind === 'VP8'
    ? [...ascii('VP8 '), ...u32le(10), 0x30, 0x01, 0x00, 0x9d, 0x01, 0x2a, ...u16le(width), ...u16le(height)]
    : kind === 'VP8L'
      ? [...ascii('VP8L'), ...u32le(5), 0x2f, ...u32le((width - 1) | ((height - 1) << 14))]
      : [...ascii('VP8X'), ...u32le(10), 0, 0, 0, 0, ...u24le(width - 1), ...u24le(height - 1)];
  return new Uint8Array([...ascii('RIFF'), ...u32le(4 + chunk.length), ...ascii('WEBP'), ...chunk]);
}
