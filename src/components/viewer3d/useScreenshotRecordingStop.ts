import { useCallback, type RefObject } from 'react';
import type GifEncoder from 'gif.js';
import { useNotificationStore } from '../../store/stores/notificationStore';
import { appLogger } from '../../utils/logger';
import {
  getRecordingStopAction,
  getRenderingFramesMessage,
} from './screenshotRecordingPolicy';

interface ScreenshotRecordingStopOptions {
  gifRef: RefObject<GifEncoder | null>;
  gifFrameCount: RefObject<number>;
  webCodecsFrameCount: RefObject<number>;
  webmRecorderRef: RefObject<MediaRecorder | null>;
  isRecordingWebCodecs: RefObject<boolean>;
  isRecordingWebm: RefObject<boolean>;
  lastProgressNotificationTimeRef: RefObject<number>;
  finishWebCodecsRecording: () => void | Promise<void>;
  setGifRenderProgress: (progress: number | null) => void;
  setIsRecordingGif: (isRecording: boolean) => void;
  log?: (message: string) => void;
  errorLog?: (message: string, error: unknown) => void;
}

export function stopScreenshotRecording({
  gifRef,
  gifFrameCount,
  webCodecsFrameCount,
  webmRecorderRef,
  isRecordingWebCodecs,
  isRecordingWebm,
  lastProgressNotificationTimeRef,
  finishWebCodecsRecording,
  setGifRenderProgress,
  setIsRecordingGif,
  log = appLogger.info,
  errorLog = appLogger.error,
}: ScreenshotRecordingStopOptions): void {
  log('Stop recording requested');

  const stopAction = getRecordingStopAction({
    hasGifRecorder: Boolean(gifRef.current),
    gifFrameCount: gifFrameCount.current,
    isRecordingWebCodecs: isRecordingWebCodecs.current,
    isRecordingMediaRecorder: isRecordingWebm.current,
    hasMediaRecorder: Boolean(webmRecorderRef.current),
  });

  if (stopAction === 'renderGif' || stopAction === 'noGifFrames') {
    log(`Stopping GIF recording early: ${gifFrameCount.current} frames captured`);
    lastProgressNotificationTimeRef.current = 0;
    const gif = gifRef.current;
    gifRef.current = null;
    if (!gif) return;

    try {
      if (stopAction === 'renderGif') {
        setGifRenderProgress(0);
        useNotificationStore.getState().addNotification(
          'info',
          getRenderingFramesMessage(gifFrameCount.current),
          3000
        );
        gif.render();
      } else {
        setIsRecordingGif(false);
        useNotificationStore.getState().addNotification('warning', 'No frames captured', 2000);
      }
    } catch (error) {
      errorLog('gif.render() error:', error);
      setGifRenderProgress(null);
      setIsRecordingGif(false);
    }
    return;
  }

  if (stopAction === 'finishWebCodecs') {
    log(`Stopping WebCodecs recording early: ${webCodecsFrameCount.current} frames captured`);
    lastProgressNotificationTimeRef.current = 0;
    finishWebCodecsRecording();
    return;
  }

  if (stopAction === 'stopMediaRecorder') {
    log('Stopping MediaRecorder recording early');
    lastProgressNotificationTimeRef.current = 0;
    webmRecorderRef.current?.stop();
  }
}

export function useScreenshotRecordingStop({
  gifRef,
  gifFrameCount,
  webCodecsFrameCount,
  webmRecorderRef,
  isRecordingWebCodecs,
  isRecordingWebm,
  lastProgressNotificationTimeRef,
  finishWebCodecsRecording,
  setGifRenderProgress,
  setIsRecordingGif,
  log,
  errorLog,
}: ScreenshotRecordingStopOptions): () => void {
  return useCallback(() => {
    stopScreenshotRecording({
      gifRef,
      gifFrameCount,
      webCodecsFrameCount,
      webmRecorderRef,
      isRecordingWebCodecs,
      isRecordingWebm,
      lastProgressNotificationTimeRef,
      finishWebCodecsRecording,
      setGifRenderProgress,
      setIsRecordingGif,
      log,
      errorLog,
    });
  }, [
    errorLog,
    finishWebCodecsRecording,
    gifFrameCount,
    gifRef,
    isRecordingWebCodecs,
    isRecordingWebm,
    lastProgressNotificationTimeRef,
    log,
    setGifRenderProgress,
    setIsRecordingGif,
    webCodecsFrameCount,
    webmRecorderRef,
  ]);
}
