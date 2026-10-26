import { bytesToBase64 } from '../../utils/base64';

export const HUB_PREVIEW_WIDTH = 320;
export const HUB_PREVIEW_HEIGHT = 168;
const MAX_PREVIEW_BYTES = 16 * 1024;

/** The centered source rectangle that fills the target without letterboxing. */
export function coverCrop(width: number, height: number, targetWidth = HUB_PREVIEW_WIDTH, targetHeight = HUB_PREVIEW_HEIGHT) {
  const scale = Math.max(targetWidth / width, targetHeight / height);
  const [cropWidth, cropHeight] = [targetWidth / scale, targetHeight / scale];
  return { x: (width - cropWidth) / 2, y: (height - cropHeight) / 2, width: cropWidth, height: cropHeight };
}

/**
 * Removes APP1 (EXIF, XMP) and COM segments, which the Hub rejects. Canvas encoders normally write
 * neither, but Safari's is unverified. Anything malformed is returned unchanged for the Hub to judge.
 * It reads the segments before the first scan the way the Hub does, fill bytes included.
 */
export function stripJpegMetadata(bytes: Uint8Array): Uint8Array {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return bytes;
  const kept: Uint8Array[] = [bytes.subarray(0, 2)];
  let offset = 2;
  let removed = false;
  while (offset + 4 <= bytes.length && bytes[offset] === 0xff) {
    let markerAt = offset + 1;
    while (bytes[markerAt] === 0xff) markerAt++;
    const marker = bytes[markerAt];
    if (marker === 0xda) break;
    const end = markerAt + 1 + ((bytes[markerAt + 1] << 8) | bytes[markerAt + 2]);
    if (end - markerAt < 3 || end > bytes.length) return bytes;
    if (marker === 0xe1 || marker === 0xfe) removed = true;
    else kept.push(bytes.subarray(offset, end));
    offset = end;
  }
  if (!removed) return bytes;
  kept.push(bytes.subarray(offset));
  const result = new Uint8Array(kept.reduce((total, part) => total + part.length, 0));
  let at = 0;
  for (const part of kept) { result.set(part, at); at += part.length; }
  return result;
}

/** The card image: the upload's preview cropped to fill 320 × 168, as a JPEG of at most 16 KiB. */
export async function makeHubThumbnail(preview: Blob): Promise<string> {
  const bitmap = await createImageBitmap(preview);
  const canvas = document.createElement('canvas');
  canvas.width = HUB_PREVIEW_WIDTH;
  canvas.height = HUB_PREVIEW_HEIGHT;
  try {
    const context = canvas.getContext('2d');
    if (!context) throw new Error('The card preview could not be created.');
    // A white backdrop makes transparent previews encode the same way in every browser.
    context.fillStyle = '#ffffff'; context.fillRect(0, 0, canvas.width, canvas.height);
    const crop = coverCrop(bitmap.width, bitmap.height);
    context.drawImage(bitmap, crop.x, crop.y, crop.width, crop.height, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.45, 0.35, 0.25, 0.15]) {
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
      if (!blob) continue;
      const bytes = stripJpegMetadata(new Uint8Array(await blob.arrayBuffer()));
      if (bytes.length <= MAX_PREVIEW_BYTES) return bytesToBase64(bytes);
    }
    throw new Error('The card preview could not fit the thumbnail limit.');
  } finally { bitmap.close(); canvas.width = canvas.height = 1; }
}
