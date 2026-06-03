import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildClipboardItem } from '../test/builders';
import {
  COPY_FEEDBACK_DURATION,
  SCREENSHOT_COPY_SUCCESS_DURATION,
  SCREENSHOT_COPY_SUCCESS_MESSAGE,
  copyScreenshotToClipboard,
  copyToClipboard,
  copyWithFeedback,
} from './clipboard';

describe('clipboard helpers', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('uses the async Clipboard API when available', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);

    await expect(copyToClipboard('hello', {
      clipboard: { writeText },
      execCommand: vi.fn(),
    })).resolves.toBe(true);

    expect(writeText).toHaveBeenCalledWith('hello');
    expect(document.querySelector('textarea')).toBeNull();
  });

  it('falls back to a temporary textarea when Clipboard API writing fails', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'));
    const execCommand = vi.fn().mockReturnValue(true);

    await expect(copyToClipboard('fallback', {
      clipboard: { writeText },
      document,
      execCommand,
    })).resolves.toBe(true);

    expect(execCommand).toHaveBeenCalledWith('copy');
    expect(document.querySelector('textarea')).toBeNull();
  });

  it('returns false and cleans up when both copy paths fail', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'));
    const execCommand = vi.fn().mockImplementation(() => {
      throw new Error('copy failed');
    });

    await expect(copyToClipboard('fallback', {
      clipboard: { writeText },
      document,
      execCommand,
    })).resolves.toBe(false);

    expect(document.querySelector('textarea')).toBeNull();
  });

  it('sets copied feedback and schedules reset only after successful copying', async () => {
    const setCopied = vi.fn();
    const schedule = vi.fn();

    await copyWithFeedback('hello', setCopied, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
      setTimeout: schedule,
    });

    expect(setCopied).toHaveBeenCalledWith(true);
    expect(schedule).toHaveBeenCalledWith(expect.any(Function), COPY_FEEDBACK_DURATION);

    const reset = schedule.mock.calls[0][0] as () => void;
    reset();
    expect(setCopied).toHaveBeenLastCalledWith(false);
  });

  it('does not set copied feedback when copying fails', async () => {
    const setCopied = vi.fn();
    const schedule = vi.fn();

    await copyWithFeedback('hello', setCopied, {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
      document,
      execCommand: vi.fn().mockReturnValue(false),
      setTimeout: schedule,
    });

    expect(setCopied).not.toHaveBeenCalled();
    expect(schedule).not.toHaveBeenCalled();
  });

  it('copies screenshot blobs with rich Clipboard API feedback', async () => {
    const blob = new Blob(['image'], { type: 'image/png' });
    const getScreenshotBlob = vi.fn().mockResolvedValue(blob);
    const clipboardItem = buildClipboardItem();
    const createClipboardItem = vi.fn().mockReturnValue(clipboardItem);
    const write = vi.fn().mockResolvedValue(undefined);
    const addNotification = vi.fn();

    await expect(copyScreenshotToClipboard(getScreenshotBlob, {
      addNotification,
      clipboard: { write },
      createClipboardItem,
    })).resolves.toBe(true);

    expect(createClipboardItem).toHaveBeenCalledWith({ 'image/png': blob });
    expect(write).toHaveBeenCalledWith([clipboardItem]);
    expect(addNotification).toHaveBeenCalledWith(
      'info',
      SCREENSHOT_COPY_SUCCESS_MESSAGE,
      SCREENSHOT_COPY_SUCCESS_DURATION
    );
  });

  it('skips screenshot copying when no blob getter or blob is available', async () => {
    const write = vi.fn().mockResolvedValue(undefined);

    await expect(copyScreenshotToClipboard(null, {
      clipboard: { write },
    })).resolves.toBe(false);
    await expect(copyScreenshotToClipboard(vi.fn().mockResolvedValue(null), {
      clipboard: { write },
    })).resolves.toBe(false);

    expect(write).not.toHaveBeenCalled();
  });

  it('reports screenshot clipboard write failures', async () => {
    const error = new Error('clipboard denied');
    const logError = vi.fn();

    await expect(copyScreenshotToClipboard(
      vi.fn().mockResolvedValue(new Blob(['image'], { type: 'image/png' })),
      {
        clipboard: { write: vi.fn().mockRejectedValue(error) },
        createClipboardItem: vi.fn().mockReturnValue(buildClipboardItem()),
        logError,
      }
    )).resolves.toBe(false);

    expect(logError).toHaveBeenCalledWith('Failed to copy screenshot to clipboard:', error);
  });
});
