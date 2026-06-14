import type { RefObject } from 'react';
import { appLogger } from '../../utils/logger';
import type { WebCodecsMuxer } from './screenshotWebCodecsStart';

interface ScreenshotWebCodecsFinishOptions {
  videoEncoderRef: RefObject<VideoEncoder | null>;
  muxerRef: RefObject<WebCodecsMuxer | null>;
  webCodecsCanvasRef: RefObject<HTMLCanvasElement | null>;
  isRecordingWebCodecsRef: RefObject<boolean>;
  webCodecsFrameCountRef: RefObject<number>;
  webCodecsResolveRef: RefObject<((blob: Blob | null) => void) | null>;
  setGifBlobUrl: (url: string | null) => void;
  setIsRecordingGif: (isRecording: boolean) => void;
  createObjectUrl?: (blob: Blob) => string;
  createBlob?: (buffer: ArrayBuffer) => Blob;
  log?: (message: string) => void;
  errorLog?: (message: string, error: unknown) => void;
}

export async function finishScreenshotWebCodecsRecording({
  videoEncoderRef,
  muxerRef,
  webCodecsCanvasRef,
  isRecordingWebCodecsRef,
  webCodecsFrameCountRef,
  webCodecsResolveRef,
  setGifBlobUrl,
  setIsRecordingGif,
  createObjectUrl = URL.createObjectURL.bind(URL),
  createBlob = (buffer) => new Blob([buffer], { type: 'video/mp4' }),
  log = appLogger.info,
  errorLog = appLogger.error,
}: ScreenshotWebCodecsFinishOptions): Promise<void> {
  if (!videoEncoderRef.current || !muxerRef.current) {
    log('finishWebCodecsRecording: refs already null');
    return;
  }

  log(`WebCodecs recording complete: ${webCodecsFrameCountRef.current} frames`);

  const encoder = videoEncoderRef.current;
  const muxer = muxerRef.current;
  const resolve = webCodecsResolveRef.current;

  // Clear refs before async finalization to prevent double-finish.
  videoEncoderRef.current = null;
  muxerRef.current = null;
  webCodecsCanvasRef.current = null;
  isRecordingWebCodecsRef.current = false;

  try {
    log('Flushing encoder...');
    await encoder.flush();
    log('Finalizing muxer...');
    await muxer.finalize();

    const { buffer } = muxer.target;
    if (!buffer) {
      throw new Error('MP4 muxer did not produce a finalized buffer.');
    }
    log(`MP4 blob size: ${buffer.byteLength}`);
    const blob = createBlob(buffer);
    const url = createObjectUrl(blob);

    setGifBlobUrl(url);
    setIsRecordingGif(false);
    resolve?.(blob);
  } catch (error) {
    errorLog('Error finalizing WebCodecs recording:', error);
    setIsRecordingGif(false);
    resolve?.(null);
  }
}
