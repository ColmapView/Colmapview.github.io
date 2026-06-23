export const RECORDING_FPS = 30;
export const FRAME_DELAY = 1000 / RECORDING_FPS;

export type RecordingQuality = 'low' | 'medium' | 'high' | 'ultra';
export type RecordingFormat = 'webm' | 'mp4';
export type RecordingBackend = 'gif' | 'webcodecs' | 'mediarecorder';
export type RecordingStopAction = 'renderGif' | 'noGifFrames' | 'finishWebCodecs' | 'stopMediaRecorder' | 'none';

export interface RecordingDimensions {
  width: number;
  height: number;
}

export interface MediaRecorderMimeConfig {
  mimeType: string;
  blobType: string;
}

export interface RecordingProgressSeconds {
  elapsedSeconds: number;
  totalSeconds: number;
}

export interface RecordingProgressDecision extends RecordingProgressSeconds {
  hasElapsedSecondChanged: boolean;
  shouldNotify: boolean;
}

export interface RecordingStopActionOptions {
  hasGifRecorder: boolean;
  gifFrameCount: number;
  isRecordingWebCodecs: boolean;
  isRecordingMediaRecorder: boolean;
  hasMediaRecorder: boolean;
}

const BITRATE_PER_PIXEL_PER_SECOND: Record<RecordingQuality, number> = {
  low: 0.05,
  medium: 0.1,
  high: 0.2,
  ultra: 0.4,
};

const MIN_BITRATE: Record<RecordingQuality, number> = {
  low: 2_000_000,
  medium: 5_000_000,
  high: 15_000_000,
  ultra: 30_000_000,
};

const MAX_BITRATE: Record<RecordingQuality, number> = {
  low: 10_000_000,
  medium: 30_000_000,
  high: 80_000_000,
  ultra: 150_000_000,
};

const GIF_QUALITY: Record<RecordingQuality, number> = {
  low: 20,
  medium: 10,
  high: 5,
  ultra: 1,
};

export function getVideoBitrate(width: number, height: number, quality: RecordingQuality): number {
  const pixels = width * height;
  const baseBitrate = pixels * BITRATE_PER_PIXEL_PER_SECOND[quality] * RECORDING_FPS;
  return Math.max(MIN_BITRATE[quality], Math.min(MAX_BITRATE[quality], baseBitrate));
}

export function formatBitrateMbps(bitrate: number): string {
  return (bitrate / 1_000_000).toFixed(1);
}

export function getRecordingProgressSeconds(elapsedMs: number, totalMs: number): RecordingProgressSeconds {
  return {
    elapsedSeconds: Math.floor(elapsedMs / 1000),
    totalSeconds: Math.floor(totalMs / 1000),
  };
}

export function shouldNotifyRecordingProgress(
  elapsedSeconds: number,
  lastNotificationSecond: number,
  intervalSeconds = 5
): boolean {
  return (
    elapsedSeconds > 0 &&
    elapsedSeconds % intervalSeconds === 0 &&
    elapsedSeconds !== lastNotificationSecond
  );
}

export function getRecordingProgressDecision(
  elapsedMs: number,
  totalMs: number,
  lastNotificationSecond: number
): RecordingProgressDecision {
  const progress = getRecordingProgressSeconds(elapsedMs, totalMs);
  return {
    ...progress,
    hasElapsedSecondChanged: progress.elapsedSeconds !== lastNotificationSecond,
    shouldNotify: shouldNotifyRecordingProgress(progress.elapsedSeconds, lastNotificationSecond),
  };
}

export function getRecordingProgressMessage(elapsedMs: number, totalMs: number): string {
  const { elapsedSeconds, totalSeconds } = getRecordingProgressSeconds(elapsedMs, totalMs);
  return `Recording: ${elapsedSeconds}s / ${totalSeconds}s`;
}

export function getDownsampledDimensions(width: number, height: number, downsample: number): RecordingDimensions {
  return {
    width: Math.floor(width / downsample),
    height: Math.floor(height / downsample),
  };
}

export function getEvenDownsampledDimensions(width: number, height: number, downsample: number): RecordingDimensions {
  const dimensions = getDownsampledDimensions(width, height, downsample);
  return {
    width: dimensions.width & ~1,
    height: dimensions.height & ~1,
  };
}

export function getAvcCodecForPixels(pixels: number): string {
  if (pixels > 2_073_600) return 'avc1.640033';
  if (pixels > 921_600) return 'avc1.640028';
  return 'avc1.64001f';
}

export function getAvcCodecForDimensions(width: number, height: number): string {
  return getAvcCodecForPixels(width * height);
}

export function getMediaRecorderMimeConfig(
  format: RecordingFormat,
  isTypeSupported: (mimeType: string) => boolean
): MediaRecorderMimeConfig {
  if (format === 'mp4') {
    if (isTypeSupported('video/mp4;codecs=avc1')) {
      return { mimeType: 'video/mp4;codecs=avc1', blobType: 'video/mp4' };
    }
    if (isTypeSupported('video/mp4')) {
      return { mimeType: 'video/mp4', blobType: 'video/mp4' };
    }
  }

  return {
    mimeType: isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm',
    blobType: 'video/webm',
  };
}

export function getGifQuality(quality: RecordingQuality): number {
  return GIF_QUALITY[quality];
}

export function getGifWorkerCount(hardwareConcurrency: number | undefined, maxWorkers = 8): number {
  return Math.min(hardwareConcurrency || 4, maxWorkers);
}

export function getGifFrameDelay(speedFactor: number): number {
  return Math.round(FRAME_DELAY / speedFactor);
}

export function isRecordingFrameDue(
  elapsedMs: number,
  lastFrameElapsedMs: number,
  frameDelayMs = FRAME_DELAY
): boolean {
  return elapsedMs - lastFrameElapsedMs >= frameDelayMs;
}

export function getWebCodecsFrameTimestamp(frameCount: number, speedFactor: number): number {
  return Math.round((frameCount * 1e6 / RECORDING_FPS) / speedFactor);
}

export interface VideoTrackOptions {
  frameRate: number;
}

/**
 * Track options for the WebCodecs MP4 muxer. The muxer derives its MP4 timescale
 * from `frameRate` and snaps each frame's timestamp to round(ts * frameRate).
 * Sped-up recordings compress per-frame timestamps to 1/(RECORDING_FPS*speed)s
 * (see getWebCodecsFrameTimestamp), so a fixed 30fps timescale rounds multiple
 * frames onto the same tick and silently drops them. Scaling the declared frame
 * rate by the speed factor keeps every frame on a distinct tick — and matches
 * the true output frame rate of the sped-up clip (capture fps * speed).
 */
export function getVideoTrackOptions(speedFactor: number): VideoTrackOptions {
  return { frameRate: RECORDING_FPS * Math.max(1, speedFactor) };
}

export function getMediaRecorderTotalDurationMs(durationMs: number, speedFactor: number): number {
  return durationMs / speedFactor;
}

export function getRecordingBackend(format: 'gif' | RecordingFormat, webCodecsSupported: boolean): RecordingBackend {
  if (format === 'gif') return 'gif';
  if (format === 'mp4' && webCodecsSupported) return 'webcodecs';
  return 'mediarecorder';
}

export function getRecordingStopAction({
  hasGifRecorder,
  gifFrameCount,
  isRecordingWebCodecs,
  isRecordingMediaRecorder,
  hasMediaRecorder,
}: RecordingStopActionOptions): RecordingStopAction {
  if (hasGifRecorder) {
    return gifFrameCount > 0 ? 'renderGif' : 'noGifFrames';
  }

  if (isRecordingWebCodecs) {
    return 'finishWebCodecs';
  }

  if (isRecordingMediaRecorder && hasMediaRecorder) {
    return 'stopMediaRecorder';
  }

  return 'none';
}

export function getRenderingFramesMessage(frameCount: number): string {
  return `Rendering ${frameCount} frames...`;
}

export function isWebCodecsRuntimeSupported(): boolean {
  return typeof VideoEncoder !== 'undefined' && typeof VideoFrame !== 'undefined';
}
