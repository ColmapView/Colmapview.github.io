import { awaitWithAbort } from './awaitWithAbort';

export async function convertToJpeg(file: File, quality: number, signal?: AbortSignal): Promise<Blob> {
  signal?.throwIfAborted();
  const bitmap = await awaitWithAbort(createImageBitmap(file), signal, lateBitmap => lateBitmap.close());
  try {
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not create a 2D canvas context for JPEG export.');
    ctx.drawImage(bitmap, 0, 0);
    return await awaitWithAbort(canvas.convertToBlob({ type: 'image/jpeg', quality }), signal);
  } finally { bitmap.close(); }
}
