import { CanvasSink } from 'mediabunny';
import { anySignal, timeoutSignal } from '../../utils/abortSignals';
import { readImageDimensions } from '../../utils/imageDimensions';
import type { ResolvedVideoImageBinding } from './types';
import { createVideoInput, readVideoTrack } from './videoInput';
import { createVideoFrameFile } from './videoFrameFile';

export const VIDEO_DECODE_TIMEOUT_MS = 90_000;
export const MAX_VIDEO_FRAME_BYTES = 64 * 1024 * 1024;

/** Every read owns and releases its demuxer, compressed cache, decoder and temporary canvas. */
export async function decodeVideoFrame(name: string, binding: ResolvedVideoImageBinding, signal: AbortSignal): Promise<File> {
  const active = anySignal([signal, timeoutSignal(VIDEO_DECODE_TIMEOUT_MS)]);
  active.throwIfAborted();
  const source = createVideoInput(binding, active);
  try {
    const { track } = await readVideoTrack(source.input, binding, active);
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
    return createVideoFrameFile(blob, name);
  } finally {
    source.dispose();
  }
}
