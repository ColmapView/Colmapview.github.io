import { CanvasSink, CustomSource, Input, MP4, WEBM } from 'mediabunny';
import { createRemoteArchiveRead } from '../../archive/remoteArchive';
import { anySignal, timeoutSignal } from '../../utils/abortSignals';
import { readImageDimensions } from '../../utils/imageDimensions';
import type { VideoImageBinding } from './types';

export const VIDEO_DECODE_TIMEOUT_MS = 90_000;
export const MAX_VIDEO_FRAME_BYTES = 64 * 1024 * 1024;

/** Every read owns and releases its demuxer, compressed cache, decoder and temporary canvas. */
export async function decodeVideoFrame(name: string, binding: VideoImageBinding, signal: AbortSignal): Promise<File> {
  const active = anySignal([signal, timeoutSignal(VIDEO_DECODE_TIMEOUT_MS)]);
  active.throwIfAborted();
  const read = createRemoteArchiveRead(binding.url, binding.bytes);
  const input = new Input({ formats: [MP4, WEBM], source: new CustomSource({
    getSize: () => binding.bytes,
    read: async (start, end) => new Uint8Array(await read(start, end - start, active)),
    maxCacheSize: 4 * 1024 * 1024,
  }) });
  const cancel = () => input.dispose();
  active.addEventListener('abort', cancel, { once: true });
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track) throw new Error('The video has no video track.');
    const width = await track.getDisplayWidth(), height = await track.getDisplayHeight();
    if (width * height > 16_000_000) throw new Error('Video dimensions exceed the 16 million pixel decode budget.');
    const duration = await track.computeDuration();
    if (binding.timestamp >= duration) throw new Error(`The requested frame is outside the video (${binding.timestamp}s).`);
    let blob: Blob;
    if (await track.canDecode()) {
      const result = await new CanvasSink(track, { poolSize: 1 }).getCanvas(binding.timestamp);
      active.throwIfAborted();
      if (!result) throw new Error('No video frame exists at the requested timestamp.');
      const canvas = result.canvas;
      try {
        blob = 'convertToBlob' in canvas ? await canvas.convertToBlob({ type: 'image/png' })
          : await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('Could not encode the video frame.')), 'image/png'));
      } finally { canvas.width = 0; canvas.height = 0; }
    } else {
      blob = await (await import('./softwareVideoFrame')).decodeSoftwareVideoFrame(track, binding.timestamp, active);
    }
    active.throwIfAborted();
    if (blob.size > MAX_VIDEO_FRAME_BYTES) throw new Error('Decoded video frame exceeds the 64 MiB image budget.');
    const size = await readImageDimensions(blob, { signal: active });
    if (!size || size.width !== binding.width || size.height !== binding.height) {
      throw new Error(`Video frame dimensions do not match camera calibration for ${name}.`);
    }
    return new File([blob], name, { type: 'image/png' });
  } finally {
    active.removeEventListener('abort', cancel);
    input.dispose();
  }
}
