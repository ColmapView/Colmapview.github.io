import { readImageDimensions } from '../../utils/imageDimensions';

export const PUBLICATION_PREVIEW_PATH = 'colmapview-preview.png';
export const MAX_PREVIEW_INPUT_BYTES = 32 * 1024 * 1024;
export const MAX_PREVIEW_EDGE = 1600;
const MAX_PREVIEW_PIXELS = 64_000_000;

/** Decode and re-encode the preview so the public asset is a bounded PNG without source metadata. */
export async function normalizePublicationPreview(blob: Blob, signal: AbortSignal): Promise<File> {
  signal.throwIfAborted();
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(blob.type) || !blob.size) {
    throw new Error('Choose a PNG, JPEG, or WebP image.');
  }
  if (blob.size > MAX_PREVIEW_INPUT_BYTES) throw new Error('Choose a preview image smaller than 32 MiB.');
  // A small compressed file can declare gigapixels; check the header before decoding.
  const declared = await readImageDimensions(blob);
  signal.throwIfAborted();
  if (!declared) throw new Error('This image could not be opened. Choose a valid PNG, JPEG, or WebP image.');
  if (declared.width * declared.height > MAX_PREVIEW_PIXELS) throw new Error('Choose a preview image with at most 64 megapixels.');
  let bitmap: ImageBitmap;
  try { bitmap = await createImageBitmap(blob); }
  catch { throw new Error('This image could not be opened. Choose a valid PNG, JPEG, or WebP image.'); }
  const canvas = document.createElement('canvas');
  try {
    signal.throwIfAborted();
    if (!bitmap.width || !bitmap.height || bitmap.width * bitmap.height > MAX_PREVIEW_PIXELS) {
      throw new Error('Choose a preview image with at most 64 megapixels.');
    }
    const scale = Math.min(1, MAX_PREVIEW_EDGE / Math.max(bitmap.width, bitmap.height));
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Image preview is unavailable in this browser.');
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const png = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
    signal.throwIfAborted();
    if (!png?.size) throw new Error('The preview image could not be created. Try another image.');
    return new File([png], PUBLICATION_PREVIEW_PATH, { type: 'image/png' });
  } finally {
    bitmap.close();
    canvas.width = canvas.height = 1;
  }
}

interface PreviewSnapshot {
  sourceKey: string;
  file: File | null;
  kind: 'view' | 'custom';
  label: string;
  busy: boolean;
  error: string | null;
}
const emptyPreview = (sourceKey: string): PreviewSnapshot =>
  ({ sourceKey, file: null, kind: 'view', label: 'Current view', busy: false, error: null });

/** Keep asynchronous captures tied to their source; the most recent user choice wins. */
export function createPublicationPreview(normalize = normalizePublicationPreview) {
  let snapshot = emptyPreview('');
  let controller: AbortController | null = null;
  const listeners = new Set<() => void>();
  const update = (next: PreviewSnapshot) => { snapshot = next; listeners.forEach(listener => listener()); };
  const cancel = () => {
    controller?.abort();
    controller = null;
    if (snapshot.busy) update({ ...snapshot, busy: false });
  };
  const run = async (kind: PreviewSnapshot['kind'], label: string, read: () => Promise<Blob | null>) => {
    cancel();
    const operation = new AbortController();
    controller = operation;
    update({ ...snapshot, busy: true, error: null });
    try {
      const blob = await read();
      operation.signal.throwIfAborted();
      if (!blob) throw new Error('The view could not be captured. Try again or choose a custom image.');
      const file = await normalize(blob, operation.signal);
      operation.signal.throwIfAborted();
      update({ ...snapshot, file, kind, label, busy: false, error: null });
    } catch (error) {
      if (!operation.signal.aborted) {
        const message = error instanceof Error ? error.message : 'The preview image could not be created.';
        update({ ...snapshot, busy: false, error: message + (snapshot.file ? ' The previous preview is unchanged.' : '') });
      }
    } finally {
      if (controller === operation) controller = null;
    }
  };
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    syncSource: (sourceKey: string) => {
      if (sourceKey === snapshot.sourceKey) return;
      cancel();
      update(emptyPreview(sourceKey));
    },
    capture: (read: () => Promise<Blob | null>) => run('view', 'Current view', read),
    replace: (file: File) => run('custom', file.name, async () => file),
    cancel,
  };
}
