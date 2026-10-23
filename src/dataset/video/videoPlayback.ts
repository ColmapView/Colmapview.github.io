import { EncodedPacketSink, VideoSampleSink, type InputVideoTrack } from 'mediabunny';
import { anySignal } from '../../utils/abortSignals';
import { createVideoInput, readVideoTrack } from './videoInput';
import { queueVideoPlayback } from './videoFrameQueue';
import type { CameraVideoSource, PlaybackFrame } from './types';
import { createVideoPlaybackClock } from './videoPlaybackClock';

async function* nativeVideoPlayback(track: InputVideoTrack, timestamp: number): AsyncGenerator<PlaybackFrame> {
  const first = await new EncodedPacketSink(track).getPacket(timestamp, { metadataOnly: true });
  if (!first) throw new Error('No video frame exists at this timestamp.');
  for await (const sample of new VideoSampleSink(track).samples(first.timestamp)) {
    try {
      yield { timestamp: sample.timestamp, duration: sample.duration, width: sample.displayWidth, height: sample.displayHeight,
        draw: context => sample.draw(context, 0, 0) };
    } finally { sample.close(); }
  }
}

/** Abortable presentation waits do not keep a decoder running in a hidden tab. */
export function waitForVideoFrame(milliseconds: number, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const cancel = () => { clearTimeout(timer); reject(signal.reason); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', cancel); resolve(); }, Math.max(0, milliseconds));
    signal.addEventListener('abort', cancel, { once: true });
  });
}

interface PlaybackOptions {
  signal: AbortSignal;
  timestamp: number;
  singleFrame?: boolean;
  onReady(duration: number): void;
  onFrame(timestamp: number): void;
  onBuffering(buffering: boolean): void;
  onInterrupted?(): void;
  onClock?(position: () => number): void;
}

/** The same serial decoder queue owns still reads and the single visible player. */
export async function playCameraVideo(source: CameraVideoSource, canvas: HTMLCanvasElement, options: PlaybackOptions) {
  const interruption = new AbortController();
  const signal = anySignal([source.signal, options.signal, interruption.signal]);
  // A same-turn close (including React's development effect probe) must not open a demuxer.
  await Promise.resolve();
  signal.throwIfAborted();
  await queueVideoPlayback({ signal, getPriority: () => 'selected' }, async () => {
    const input = createVideoInput(source, signal);
    try {
      const { track, duration } = await readVideoTrack(input.input, source, signal);
      const timestamp = Math.min(Math.max(0, options.timestamp), Math.max(0, duration - 1e-7));
      options.onReady(duration);
      const frames = await track.canDecode() ? nativeVideoPlayback(track, timestamp)
        : (await import('./softwareVideoPlayback')).softwareVideoPlayback(track, timestamp, duration, source.width, source.height, signal, options.singleFrame ? 1 : undefined);
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Video playback needs a canvas.');
      const clock = createVideoPlaybackClock(timestamp, duration);
      options.onClock?.(clock.position);
      let started = false;
      try {
        for (;;) {
          options.onBuffering(true);
          const result = await frames.next();
          options.onBuffering(false);
          signal.throwIfAborted();
          if (result.done) {
            if (started) await waitForVideoFrame(clock.delayUntil(duration), signal);
            break;
          }
          const frame = result.value;
          if (!started) {
            clock.start(frame.timestamp, frame.timestamp + frame.duration, !options.singleFrame); started = true;
          } else {
            clock.allowUntil(frame.timestamp);
            await waitForVideoFrame(clock.delayUntil(frame.timestamp), signal);
          }
          if (canvas.width !== frame.width || canvas.height !== frame.height) { canvas.width = frame.width; canvas.height = frame.height; }
          frame.draw(context);
          clock.allowUntil(frame.timestamp + frame.duration);
          options.onFrame(frame.timestamp);
          if (options.singleFrame) break;
        }
      } finally { clock.stop(); await frames.return(undefined); }
      return null;
    } finally { input.dispose(); }
  }, () => {
    interruption.abort();
    try { options.onInterrupted?.(); } catch { /* An observer cannot prevent a foreground read. */ }
  });
  signal.throwIfAborted();
}
