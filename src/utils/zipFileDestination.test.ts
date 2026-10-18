import { afterEach, describe, expect, it, vi } from 'vitest';
import { canSaveZipToFile, requestZipFile, ZipFilePickerCancelledError } from './zipFileDestination';

afterEach(() => { vi.unstubAllGlobals(); });

describe('ZIP file destination', () => {
  it('requests the named ZIP synchronously, during the initiating user activation', async () => {
    const handle = { name: 'chosen.zip' } as FileSystemFileHandle;
    const picker = vi.fn(async function (this: Window) { expect(this).toBe(window); return handle; });
    vi.stubGlobal('window', { showSaveFilePicker: picker });
    expect(canSaveZipToFile()).toBe(true);
    const pending = requestZipFile('colmap-images.zip');
    expect(picker).toHaveBeenCalledWith({ suggestedName: 'colmap-images.zip',
      types: [{ description: 'ZIP archive', accept: { 'application/zip': ['.zip'] } }] });
    expect(await pending).toBe(handle);
  });

  it('offers ordinary downloads when direct saving is unavailable', async () => {
    vi.stubGlobal('window', {});
    expect(canSaveZipToFile()).toBe(false);
    await expect(requestZipFile('scene.zip')).rejects.toThrow(/Use Download COLMAP/);
  });

  it('distinguishes a dismissed picker from permission and activation failures', async () => {
    const picker = vi.fn().mockRejectedValueOnce(new DOMException('Dismissed', 'AbortError'))
      .mockRejectedValueOnce(new DOMException('User activation required', 'SecurityError'));
    vi.stubGlobal('window', { showSaveFilePicker: picker });
    await expect(requestZipFile('scene.zip')).rejects.toBeInstanceOf(ZipFilePickerCancelledError);
    await expect(requestZipFile('scene.zip')).rejects.toMatchObject({ name: 'SecurityError' });
  });

  it('does not open a picker for an already cancelled export', async () => {
    const picker = vi.fn();
    vi.stubGlobal('window', { showSaveFilePicker: picker });
    const controller = new AbortController(); controller.abort();
    await expect(requestZipFile('scene.zip', controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(picker).not.toHaveBeenCalled();
  });

  it('ignores a late picker selection after cancellation or scene replacement', async () => {
    let select!: (handle: FileSystemFileHandle) => void;
    const picker = vi.fn(() => new Promise<FileSystemFileHandle>(resolve => { select = resolve; }));
    vi.stubGlobal('window', { showSaveFilePicker: picker });
    const controller = new AbortController(), createWritable = vi.fn();
    const pending = requestZipFile('scene.zip', controller.signal);
    const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    controller.abort(); await rejected;
    select({ createWritable } as unknown as FileSystemFileHandle);
    await Promise.resolve();
    expect(createWritable).not.toHaveBeenCalled();
  });
});
