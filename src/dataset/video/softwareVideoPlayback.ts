import type { InputVideoTrack } from 'mediabunny';
import { readEncodedVideoWindow } from './encodedVideoWindow';
import { createSoftwareVideoDecoder } from './softwareVideoDecoder';
import type { PlaybackFrame } from './types';

const MAX_RAW_WINDOW_BYTES = 32 * 1024 * 1024;
const MAX_WINDOW_FRAMES = 8;

/** One reusable worker, one raw window at a time. No PNG encoding or full-video conversion. */
export async function* softwareVideoPlayback(track: InputVideoTrack, timestamp: number, duration: number,
  width: number, height: number, signal: AbortSignal, maxFrames = MAX_WINDOW_FRAMES): AsyncGenerator<PlaybackFrame> {
  const scale = Math.min(1, 1280 / Math.max(width, height));
  width = Math.max(1, Math.round(width * scale)); height = Math.max(1, Math.round(height * scale));
  const frameBytes = width * height * 4;
  const count = Math.min(maxFrames, MAX_WINDOW_FRAMES, Math.floor(MAX_RAW_WINDOW_BYTES / frameBytes));
  const decoder = await createSoftwareVideoDecoder(signal);
  try {
    while (timestamp < duration) {
      signal.throwIfAborted();
      const window = await readEncodedVideoWindow(track, timestamp, count, signal);
      const { ffmpeg } = decoder;
      await ffmpeg.writeFile('input.mp4', window.data, { signal });
      const exit = await ffmpeg.exec(['-nostdin', '-threads', '1', '-max_alloc', '134217728', '-flags2', '+showall', '-i', 'input.mp4',
        '-vf', `select=gte(t\\,0),select=between(n\\,${window.frameIndex}\\,${window.frameIndex + window.frames.length - 1}),scale=${width}:${height}`,
        '-fps_mode', 'passthrough', '-frames:v', String(window.frames.length), '-threads', '1', '-pix_fmt', 'rgba', '-f', 'rawvideo', 'frames.rgba'], 60000, { signal });
      signal.throwIfAborted();
      if (exit !== 0) throw new Error('The software decoder could not play this video.');
      const raw = await ffmpeg.readFile('frames.rgba', undefined, { signal });
      await ffmpeg.deleteFile('input.mp4', { signal });
      await ffmpeg.deleteFile('frames.rgba', { signal });
      if (typeof raw === 'string' || raw.byteLength !== frameBytes * window.frames.length || raw.byteLength > MAX_RAW_WINDOW_BYTES) throw new Error('The software decoder returned an incomplete video window.');
      const buffer = raw.buffer;
      if (!(buffer instanceof ArrayBuffer)) throw new Error('The software decoder returned shared frame memory.');
      for (let index = 0; index < window.frames.length; index++) {
        signal.throwIfAborted();
        const frame = window.frames[index];
        yield {
          ...frame,
          draw(context) {
            const pixels = new Uint8ClampedArray(buffer, raw.byteOffset + index * frameBytes, frameBytes);
            context.putImageData(new ImageData(pixels, width, height), 0, 0);
          },
          width, height,
        };
      }
      const last = window.frames.at(-1)!;
      const next = last.timestamp + last.duration;
      if (next <= timestamp || last.duration <= 0) break;
      timestamp = next + 1e-7;
    }
  } finally { decoder.dispose(); }
}
