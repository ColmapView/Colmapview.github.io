import type { InputVideoTrack } from 'mediabunny';
import { readEncodedVideoWindow } from './encodedVideoWindow';
import { createSoftwareVideoDecoder } from './softwareVideoDecoder';

/** Each matched still/export read owns and releases its bounded decoder. */
export async function decodeSoftwareVideoFrame(track: InputVideoTrack, timestamp: number, signal: AbortSignal): Promise<Blob> {
  const window = await readEncodedVideoWindow(track, timestamp, 1, signal);
  const decoder = await createSoftwareVideoDecoder(signal);
  try {
    const { ffmpeg } = decoder;
    await ffmpeg.writeFile('input.mp4', window.data, { signal });
    // Open-GOP recovery can hide valid frames; discard negative timestamps before counting.
    const exit = await ffmpeg.exec(['-nostdin', '-threads', '1', '-max_alloc', '134217728', '-flags2', '+showall', '-i', 'input.mp4',
      '-vf', `select=gte(t\\,0),select=eq(n\\,${window.frameIndex})`, '-fps_mode', 'passthrough', '-frames:v', '1', '-threads', '1', '-f', 'image2', 'frame.png'], 60000, { signal });
    signal.throwIfAborted();
    if (exit !== 0) throw new Error('The software decoder could not extract this video frame.');
    const data = await ffmpeg.readFile('frame.png', undefined, { signal });
    if (typeof data === 'string') throw new Error('The software decoder returned an invalid image.');
    return new Blob([new Uint8Array(data)], { type: 'image/png' });
  } finally { decoder.dispose(); }
}
