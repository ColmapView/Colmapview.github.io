import type { InputVideoTrack } from 'mediabunny';
import { anySignal, timeoutSignal } from '../../utils/abortSignals';
import { awaitWithAbort } from '../../utils/awaitWithAbort';
import type { CameraVideoSource, ResolvedVideoImageBinding, VideoImageBinding } from './types';

export const VIDEO_INDEX_METADATA_BYTES = 16 * 1024 * 1024;
export const VIDEO_INDEX_CACHE_BYTES = 8 * 1024 * 1024;
export const MAX_VIDEO_INDEX_FRAMES = 250000;

/** Metadata only: packet decode order must never become the public frame numbering. */
export async function indexVideoTrack(track: InputVideoTrack, signal: AbortSignal): Promise<Float64Array> {
  const { EncodedPacketSink } = await import('mediabunny');
  signal.throwIfAborted();
  const timestamps: number[] = [];
  let negativeFrame = false, packets = 0;
  for await (const packet of new EncodedPacketSink(track).packets(undefined, undefined, { metadataOnly: true })) {
    signal.throwIfAborted();
    if (++packets > MAX_VIDEO_INDEX_FRAMES) throw new Error('Video presentation index exceeds its frame budget.');
    if (!Number.isFinite(packet.timestamp) || !Number.isFinite(packet.duration) || packet.duration <= 0) {
      throw new Error('The video has ambiguous presentation-frame timing.');
    }
    if (packet.timestamp >= 0) timestamps.push(packet.timestamp);
    else if (packet.timestamp + packet.duration > 0) negativeFrame = true;
  }
  const ordered = Float64Array.from(timestamps).sort();
  for (let index = 1; index < ordered.length; index++) {
    if (ordered[index] === ordered[index - 1]) throw new Error('The video has ambiguous duplicate frame timestamps.');
  }
  // Decode preroll is not displayed. A frame spanning time zero is displayed there.
  if (negativeFrame && (!ordered.length || ordered[0] > 0)) return Float64Array.from([0, ...ordered]);
  if (!ordered.length) throw new Error('The video has no displayed frames.');
  return ordered;
}

/** Own the transport and demuxer only for the duration of the bounded metadata read. */
export async function readVideoPresentationIndex(binding: VideoImageBinding, ownerSignal: AbortSignal): Promise<Float64Array> {
  const signal = anySignal([ownerSignal, timeoutSignal(90000)]);
  const { createVideoInput, readVideoTrack } = await import('./videoInput');
  const source = createVideoInput(binding, signal, VIDEO_INDEX_METADATA_BYTES);
  try {
    const { track } = await readVideoTrack(source.input, binding, signal);
    return await indexVideoTrack(track, signal);
  } finally { source.dispose(); }
}

function resolved(binding: VideoImageBinding, timestamp: number): ResolvedVideoImageBinding {
  return { url: binding.url, bytes: binding.bytes, width: binding.width, height: binding.height,
    ...(binding.playbackRate !== undefined && { playbackRate: binding.playbackRate }), timestamp };
}

function select(binding: VideoImageBinding, timestamps: Float64Array): ResolvedVideoImageBinding {
  const index = binding.frameIndex;
  if (index === undefined || !Number.isSafeInteger(index) || index < 0 || index >= timestamps.length) {
    throw new Error(`Video frame index ${index} is outside the ${timestamps.length} displayed frames.`);
  }
  return resolved(binding, timestamps[index]);
}

type ReadIndex = typeof readVideoPresentationIndex;
interface IndexEntry { controller: AbortController; promise: Promise<Float64Array>; timestamps?: Float64Array; consumers: number }

/** One bounded, scene-owned index per recording; cancel work when its last consumer leaves. */
export function createVideoFrameResolver(ownerSignal: AbortSignal, readIndex: ReadIndex = readVideoPresentationIndex) {
  const entries = new Map<string, IndexEntry>();
  let queue = Promise.resolve();
  const trim = (reserve = 0) => {
    let bytes = [...entries.values()].reduce((total, entry) => total + (entry.timestamps?.byteLength ?? 0), 0);
    for (const [key, entry] of entries) {
      if (bytes <= VIDEO_INDEX_CACHE_BYTES && entries.size + reserve <= 32) break;
      if (entry.timestamps && !entry.consumers) { entries.delete(key); bytes -= entry.timestamps.byteLength; }
    }
  };
  ownerSignal.addEventListener('abort', () => {
    for (const entry of entries.values()) entry.controller.abort(ownerSignal.reason);
    entries.clear();
  }, { once: true });
  return async (binding: VideoImageBinding, signal: AbortSignal): Promise<ResolvedVideoImageBinding> => {
    ownerSignal.throwIfAborted(); signal.throwIfAborted();
    if (binding.timestamp !== undefined) return resolved(binding, binding.timestamp);
    const key = JSON.stringify([binding.url, binding.bytes, binding.width, binding.height]);
    let entry = entries.get(key);
    if (!entry) {
      trim(1);
      if (entries.size >= 32) throw new Error('Too many pending video presentation indices.');
      const controller = new AbortController();
      const promise = queue.then(() => {
        const active = anySignal([ownerSignal, controller.signal]);
        active.throwIfAborted();
        return readIndex(binding, active);
      });
      queue = promise.then(() => {}, () => {});
      entry = { controller, promise, consumers: 0 };
      const current = entry;
      entries.set(key, current);
      void promise.then(timestamps => { current.timestamps = timestamps; trim(); }, () => {
        if (entries.get(key) === current) entries.delete(key);
      });
    } else { entries.delete(key); entries.set(key, entry); }
    entry.consumers++;
    try { return select(binding, await awaitWithAbort(entry.promise, signal)); }
    finally {
      entry.consumers--;
      if (!entry.consumers && !entry.timestamps) {
        entry.controller.abort();
        if (entries.get(key) === entry) entries.delete(key);
      }
      trim();
    }
  };
}

/** Standalone playback callers can resolve too; scene media supplies its shared resolver. */
export async function resolveCameraVideoFrame(source: CameraVideoSource, signal: AbortSignal): Promise<ResolvedVideoImageBinding> {
  signal.throwIfAborted();
  if (source.timestamp !== undefined) return resolved(source, source.timestamp);
  if (source.resolveFrame) return source.resolveFrame(signal);
  return select(source, await readVideoPresentationIndex(source, signal));
}
