import { appLogger } from './logger';

export const COPY_FEEDBACK_DURATION = 2000;

interface ClipboardLike {
  writeText(text: string): Promise<void>;
}

interface RichClipboardLike {
  write(items: ClipboardItem[]): Promise<void>;
}

type ClipboardNotification = (type: 'info' | 'warning', message: string, duration?: number) => void;
type ClipboardItemFactory = (items: Record<string, Blob>) => ClipboardItem;

export interface CopyToClipboardDeps {
  clipboard?: ClipboardLike | null;
  document?: Document;
  execCommand?: (command: string) => boolean;
}

export interface CopyWithFeedbackDeps extends CopyToClipboardDeps {
  feedbackDuration?: number;
  setTimeout?: (callback: () => void, delay: number) => unknown;
}

export interface CopyScreenshotToClipboardDeps {
  addNotification?: ClipboardNotification;
  clipboard?: RichClipboardLike | null;
  createClipboardItem?: ClipboardItemFactory;
  logError?: (message: string, error: unknown) => void;
}

export const SCREENSHOT_COPY_SUCCESS_MESSAGE = 'Screenshot copied! Press Ctrl+V to paste';
export const SCREENSHOT_COPY_SUCCESS_DURATION = 4000;

export async function copyToClipboard(
  text: string,
  deps: CopyToClipboardDeps = {}
): Promise<boolean> {
  const clipboard = deps.clipboard ?? navigator.clipboard;
  if (clipboard) {
    try {
      await clipboard.writeText(text);
      return true;
    } catch {
      // Fall through to the textarea copy path for older or restricted browsers.
    }
  }

  const documentRef = deps.document ?? document;
  const textarea = documentRef.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  documentRef.body.appendChild(textarea);
  textarea.select();

  try {
    const execCommand = deps.execCommand ?? documentRef.execCommand.bind(documentRef);
    return execCommand('copy');
  } catch {
    return false;
  } finally {
    documentRef.body.removeChild(textarea);
  }
}

export async function copyWithFeedback(
  text: string,
  setCopied: (copied: boolean) => void,
  deps: CopyWithFeedbackDeps = {}
): Promise<void> {
  const success = await copyToClipboard(text, deps);
  if (!success) return;

  setCopied(true);
  const schedule = deps.setTimeout ?? setTimeout;
  schedule(() => setCopied(false), deps.feedbackDuration ?? COPY_FEEDBACK_DURATION);
}

export async function copyScreenshotToClipboard(
  getScreenshotBlob: (() => Promise<Blob | null>) | null | undefined,
  deps: CopyScreenshotToClipboardDeps = {}
): Promise<boolean> {
  if (!getScreenshotBlob) return false;

  try {
    const blob = await getScreenshotBlob();
    if (!blob) return false;

    const clipboard = deps.clipboard ?? navigator.clipboard;
    if (!clipboard) return false;

    const createClipboardItem = deps.createClipboardItem ?? ((items) => new ClipboardItem(items));
    await clipboard.write([
      createClipboardItem({ 'image/png': blob }),
    ]);
    deps.addNotification?.(
      'info',
      SCREENSHOT_COPY_SUCCESS_MESSAGE,
      SCREENSHOT_COPY_SUCCESS_DURATION
    );
    return true;
  } catch (err) {
    const logError = deps.logError ?? appLogger.error;
    logError('Failed to copy screenshot to clipboard:', err);
    return false;
  }
}
