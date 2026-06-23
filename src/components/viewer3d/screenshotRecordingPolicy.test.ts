import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  formatBitrateMbps,
  getAvcCodecForDimensions,
  getDownsampledDimensions,
  getEvenDownsampledDimensions,
  getGifFrameDelay,
  getGifQuality,
  getGifWorkerCount,
  getMediaRecorderMimeConfig,
  getMediaRecorderTotalDurationMs,
  getRecordingBackend,
  getRecordingProgressDecision,
  getRecordingProgressMessage,
  getRecordingProgressSeconds,
  getRecordingStopAction,
  getRenderingFramesMessage,
  getVideoBitrate,
  getVideoTrackOptions,
  getWebCodecsFrameTimestamp,
  isRecordingFrameDue,
  isWebCodecsRuntimeSupported,
  shouldNotifyRecordingProgress,
} from './screenshotRecordingPolicy';

describe('screenshot recording policy', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('calculates video bitrate with quality-specific clamps', () => {
    expect(getVideoBitrate(16, 16, 'low')).toBe(2_000_000);
    expect(getVideoBitrate(3840, 2160, 'ultra')).toBe(99_532_800);
    expect(getVideoBitrate(12000, 8000, 'ultra')).toBe(150_000_000);
    expect(formatBitrateMbps(15_500_000)).toBe('15.5');
  });

  it('derives downsampled dimensions and H.264-safe even dimensions', () => {
    expect(getDownsampledDimensions(1921, 1081, 2)).toEqual({ width: 960, height: 540 });
    expect(getEvenDownsampledDimensions(1921, 1083, 2)).toEqual({ width: 960, height: 540 });
  });

  it('derives recording progress notification policy', () => {
    expect(getRecordingProgressSeconds(5999, 12345)).toEqual({
      elapsedSeconds: 5,
      totalSeconds: 12,
    });
    expect(getRecordingProgressMessage(5999, 12345)).toBe('Recording: 5s / 12s');
    expect(shouldNotifyRecordingProgress(0, -1)).toBe(false);
    expect(shouldNotifyRecordingProgress(4, 0)).toBe(false);
    expect(shouldNotifyRecordingProgress(5, 0)).toBe(true);
    expect(shouldNotifyRecordingProgress(5, 5)).toBe(false);
    expect(shouldNotifyRecordingProgress(10, 5)).toBe(true);
  });

  it('derives per-frame progress and capture cadence decisions', () => {
    expect(getRecordingProgressDecision(5999, 12345, 4)).toEqual({
      elapsedSeconds: 5,
      totalSeconds: 12,
      hasElapsedSecondChanged: true,
      shouldNotify: true,
    });
    expect(getRecordingProgressDecision(6999, 12345, 6)).toEqual({
      elapsedSeconds: 6,
      totalSeconds: 12,
      hasElapsedSecondChanged: false,
      shouldNotify: false,
    });
    expect(isRecordingFrameDue(33, 0)).toBe(false);
    expect(isRecordingFrameDue(34, 0)).toBe(true);
    expect(isRecordingFrameDue(1040, 1000, 50)).toBe(false);
  });

  it('selects AVC codec levels from recording size', () => {
    expect(getAvcCodecForDimensions(1280, 720)).toBe('avc1.64001f');
    expect(getAvcCodecForDimensions(1920, 1080)).toBe('avc1.640028');
    expect(getAvcCodecForDimensions(3840, 2160)).toBe('avc1.640033');
  });

  it('chooses MediaRecorder MIME settings with mp4 and webm fallbacks', () => {
    expect(getMediaRecorderMimeConfig('mp4', type => type === 'video/mp4;codecs=avc1')).toEqual({
      mimeType: 'video/mp4;codecs=avc1',
      blobType: 'video/mp4',
    });
    expect(getMediaRecorderMimeConfig('mp4', type => type === 'video/mp4')).toEqual({
      mimeType: 'video/mp4',
      blobType: 'video/mp4',
    });
    expect(getMediaRecorderMimeConfig('mp4', type => type === 'video/webm;codecs=vp9')).toEqual({
      mimeType: 'video/webm;codecs=vp9',
      blobType: 'video/webm',
    });
    expect(getMediaRecorderMimeConfig('webm', () => false)).toEqual({
      mimeType: 'video/webm',
      blobType: 'video/webm',
    });
  });

  it('derives GIF quality, worker count, and speed-adjusted frame delay', () => {
    expect(getGifQuality('low')).toBe(20);
    expect(getGifQuality('ultra')).toBe(1);
    expect(getGifWorkerCount(undefined)).toBe(4);
    expect(getGifWorkerCount(12)).toBe(8);
    expect(getGifFrameDelay(2)).toBe(17);
  });

  it('derives video timing and backend selection', () => {
    expect(getWebCodecsFrameTimestamp(30, 1)).toBe(1_000_000);
    expect(getWebCodecsFrameTimestamp(30, 2)).toBe(500_000);
    expect(getMediaRecorderTotalDurationMs(10_000, 2)).toBe(5_000);
    expect(getRecordingBackend('gif', true)).toBe('gif');
    expect(getRecordingBackend('mp4', true)).toBe('webcodecs');
    expect(getRecordingBackend('mp4', false)).toBe('mediarecorder');
    expect(getRecordingBackend('webm', true)).toBe('mediarecorder');
  });

  it('chooses stop-recording actions by active backend priority', () => {
    expect(getRecordingStopAction({
      hasGifRecorder: true,
      gifFrameCount: 3,
      isRecordingWebCodecs: true,
      isRecordingMediaRecorder: true,
      hasMediaRecorder: true,
    })).toBe('renderGif');

    expect(getRecordingStopAction({
      hasGifRecorder: true,
      gifFrameCount: 0,
      isRecordingWebCodecs: false,
      isRecordingMediaRecorder: false,
      hasMediaRecorder: false,
    })).toBe('noGifFrames');

    expect(getRecordingStopAction({
      hasGifRecorder: false,
      gifFrameCount: 0,
      isRecordingWebCodecs: true,
      isRecordingMediaRecorder: true,
      hasMediaRecorder: true,
    })).toBe('finishWebCodecs');

    expect(getRecordingStopAction({
      hasGifRecorder: false,
      gifFrameCount: 0,
      isRecordingWebCodecs: false,
      isRecordingMediaRecorder: true,
      hasMediaRecorder: true,
    })).toBe('stopMediaRecorder');

    expect(getRecordingStopAction({
      hasGifRecorder: false,
      gifFrameCount: 0,
      isRecordingWebCodecs: false,
      isRecordingMediaRecorder: true,
      hasMediaRecorder: false,
    })).toBe('none');
    expect(getRenderingFramesMessage(12)).toBe('Rendering 12 frames...');
  });

  it('detects WebCodecs runtime support from browser globals', () => {
    vi.stubGlobal('VideoEncoder', undefined);
    vi.stubGlobal('VideoFrame', undefined);
    expect(isWebCodecsRuntimeSupported()).toBe(false);

    vi.stubGlobal('VideoEncoder', class TestVideoEncoder {});
    vi.stubGlobal('VideoFrame', class TestVideoFrame {});
    expect(isWebCodecsRuntimeSupported()).toBe(true);
  });
});

describe('getVideoTrackOptions (sped-up MP4 frame collapse)', () => {
  // Mirrors mediabunny: it derives the MP4 timescale from frameRate and snaps
  // each frame's timestamp to round(tsSeconds * frameRate) ticks. Two frames
  // landing on the same tick are dropped/coalesced.
  const muxerTick = (frameCount: number, speedFactor: number): number => {
    const tsSeconds = getWebCodecsFrameTimestamp(frameCount, speedFactor) / 1e6;
    return Math.round(tsSeconds * getVideoTrackOptions(speedFactor).frameRate);
  };

  it('scales the output frame rate by the speed factor', () => {
    expect(getVideoTrackOptions(1)).toEqual({ frameRate: 30 });
    expect(getVideoTrackOptions(2)).toEqual({ frameRate: 60 });
    expect(getVideoTrackOptions(3)).toEqual({ frameRate: 90 });
    expect(getVideoTrackOptions(4)).toEqual({ frameRate: 120 });
  });

  it('produces strictly increasing muxer ticks at every speed (no dropped frames)', () => {
    for (const speed of [1, 2, 3, 4]) {
      const ticks = Array.from({ length: 30 }, (_, n) => muxerTick(n, speed));
      for (let i = 1; i < ticks.length; i++) {
        expect(ticks[i]).toBeGreaterThan(ticks[i - 1]);
      }
    }
  });

  it('regression: a fixed 30fps timescale WOULD collapse sped-up frames', () => {
    // Demonstrates the original bug (frameRate hardcoded to 30): adjacent frames
    // at speed 2 round to the same tick. The fix above avoids this.
    const fixedTick = (n: number, speed: number) =>
      Math.round((getWebCodecsFrameTimestamp(n, speed) / 1e6) * 30);
    expect(fixedTick(1, 2)).toBe(fixedTick(2, 2));
  });

  it('never returns a zero/negative frame rate for a degenerate speed', () => {
    expect(getVideoTrackOptions(0).frameRate).toBeGreaterThan(0);
  });
});
