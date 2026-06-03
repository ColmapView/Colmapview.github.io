import { describe, expect, it, vi } from 'vitest';
import {
  GIF_DOWNSAMPLE_OPTIONS,
  GIF_SPEED_OPTIONS,
  SCREENSHOT_SIZE_OPTIONS,
  getRecordButtonState,
  getRecordingActionButtonStyle,
  getSaveRecordingButtonState,
  startRecordingCountdown,
} from './screenshotPanelRecording';

describe('screenshot panel recording helpers', () => {
  it('preserves screenshot and recording option labels', () => {
    expect(SCREENSHOT_SIZE_OPTIONS.map((option) => option.label)).toContain('1920×1080');
    expect(GIF_DOWNSAMPLE_OPTIONS.map((option) => option.label)).toEqual([
      '1× (Full)',
      '½',
      '¼',
      '⅛',
    ]);
    expect(GIF_SPEED_OPTIONS.map((option) => option.label)).toEqual(['1×', '2×', '3×', '4×']);
  });

  it('runs the recording countdown and schedules auto-download after recording completes', async () => {
    const addNotification = vi.fn();
    const downloadGif = vi.fn();
    const recordGif = vi.fn().mockResolvedValue(new Blob(['gif']));
    const setRecordCountdown = vi.fn();
    const scheduled: { callback: () => void; delay: number }[] = [];

    const started = startRecordingCountdown({
      addNotification,
      downloadGif,
      isRecordingGif: false,
      recordCountdown: null,
      recordGif,
      schedule: (callback, delay) => {
        scheduled.push({ callback, delay });
      },
      setRecordCountdown,
    });

    expect(started).toBe(true);
    expect(setRecordCountdown).toHaveBeenNthCalledWith(1, 3);
    expect(setRecordCountdown).toHaveBeenNthCalledWith(2, 3);
    expect(addNotification).toHaveBeenNthCalledWith(1, 'info', 'Countdown (3)', 900);
    expect(scheduled[0].delay).toBe(1000);

    scheduled[0].callback();
    scheduled[1].callback();
    scheduled[2].callback();
    await Promise.resolve();

    expect(setRecordCountdown).toHaveBeenNthCalledWith(3, 2);
    expect(setRecordCountdown).toHaveBeenNthCalledWith(4, 1);
    expect(setRecordCountdown).toHaveBeenLastCalledWith(null);
    expect(addNotification).toHaveBeenCalledWith('info', 'Countdown (2)', 900);
    expect(addNotification).toHaveBeenCalledWith('info', 'Countdown (1)', 900);
    expect(addNotification).toHaveBeenCalledWith('info', 'Recording started!', 2000);
    expect(recordGif).toHaveBeenCalledOnce();
    expect(addNotification).toHaveBeenCalledWith('info', 'Recording complete! Downloading...', 3000);
    expect(scheduled[3].delay).toBe(100);

    scheduled[3].callback();
    expect(downloadGif).toHaveBeenCalledOnce();
  });

  it('does not start countdown while recording is unavailable, active, or already counting down', () => {
    const baseOptions = {
      addNotification: vi.fn(),
      downloadGif: vi.fn(),
      schedule: vi.fn(),
      setRecordCountdown: vi.fn(),
    };

    expect(startRecordingCountdown({
      ...baseOptions,
      isRecordingGif: false,
      recordCountdown: null,
      recordGif: null,
    })).toBe(false);
    expect(startRecordingCountdown({
      ...baseOptions,
      isRecordingGif: true,
      recordCountdown: null,
      recordGif: vi.fn(),
    })).toBe(false);
    expect(startRecordingCountdown({
      ...baseOptions,
      isRecordingGif: false,
      recordCountdown: 2,
      recordGif: vi.fn(),
    })).toBe(false);

    expect(baseOptions.setRecordCountdown).not.toHaveBeenCalled();
    expect(baseOptions.addNotification).not.toHaveBeenCalled();
  });

  it('derives record button state for idle, countdown, rendering, and active recording states', () => {
    expect(getRecordButtonState({
      gifRenderProgress: null,
      hasRecordGif: true,
      isRecordingGif: false,
      recordCountdown: null,
    })).toEqual({
      disabled: false,
      label: 'Record',
      style: 'default',
    });
    expect(getRecordButtonState({
      gifRenderProgress: null,
      hasRecordGif: true,
      isRecordingGif: false,
      recordCountdown: 2,
    })).toEqual({
      disabled: true,
      label: '(2)',
      style: 'primary',
    });
    expect(getRecordButtonState({
      gifRenderProgress: 65,
      hasRecordGif: true,
      isRecordingGif: false,
      recordCountdown: null,
    })).toEqual({
      disabled: true,
      label: 'Render 65%',
      style: 'primary',
    });
    expect(getRecordButtonState({
      gifRenderProgress: null,
      hasRecordGif: true,
      isRecordingGif: true,
      recordCountdown: null,
    })).toEqual({
      disabled: true,
      label: 'Recording...',
      style: 'primary',
    });
    expect(getRecordButtonState({
      gifRenderProgress: null,
      hasRecordGif: false,
      isRecordingGif: false,
      recordCountdown: null,
    })).toEqual({
      disabled: true,
      label: 'Record',
      style: 'default',
    });
  });

  it('derives save button state for unavailable, saved, recording, rendering, and countdown states', () => {
    expect(getSaveRecordingButtonState({
      gifBlobUrl: null,
      gifRenderProgress: null,
      isRecordingGif: false,
      recordCountdown: null,
    })).toEqual({
      disabled: true,
      label: 'Save',
      style: 'disabled',
    });
    expect(getSaveRecordingButtonState({
      gifBlobUrl: 'blob:url',
      gifRenderProgress: null,
      isRecordingGif: false,
      recordCountdown: null,
    })).toEqual({
      disabled: false,
      label: 'Save',
      style: 'default',
    });
    expect(getSaveRecordingButtonState({
      gifBlobUrl: null,
      gifRenderProgress: null,
      isRecordingGif: true,
      recordCountdown: null,
    })).toEqual({
      disabled: false,
      label: 'Stop',
      style: 'primary',
    });
    expect(getSaveRecordingButtonState({
      gifBlobUrl: 'blob:url',
      gifRenderProgress: 35,
      isRecordingGif: false,
      recordCountdown: null,
    }).disabled).toBe(true);
    expect(getSaveRecordingButtonState({
      gifBlobUrl: 'blob:url',
      gifRenderProgress: null,
      isRecordingGif: false,
      recordCountdown: 2,
    }).disabled).toBe(true);
  });

  it('builds the recording action button sizing style', () => {
    expect(getRecordingActionButtonStyle()).toEqual({ flex: 1, minWidth: 0 });
  });
});
