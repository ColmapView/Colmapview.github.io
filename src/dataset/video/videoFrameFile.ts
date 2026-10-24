import { convertToJpeg } from '../../utils/convertToJpeg';

const derivedFrames = new WeakSet<File>();

/** Retain lossless pixels for display/metrics; package encoders own the output format. */
export function createVideoFrameFile(blob: Blob, name: string): File {
  const file = new File([blob], name, { type: 'image/png' });
  derivedFrames.add(file);
  return file;
}

export async function prepareVideoFrameExport(file: File, name: string, signal?: AbortSignal): Promise<Blob> {
  signal?.throwIfAborted();
  if (!derivedFrames.has(file) || /\.png$/i.test(name) || !/\.[^/\\.]+$/.test(name)) return file;
  if (/\.jpe?g$/i.test(name)) return convertToJpeg(file, 0.95, signal);
  throw new Error(`Video-derived image export needs a PNG or JPEG filename: ${name}`);
}
