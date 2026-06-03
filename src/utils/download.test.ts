import { describe, expect, it, vi } from 'vitest';
import { buildAnchorElement } from '../test/builders';
import { buildTimestampedFilename, downloadUrl } from './download';

describe('download utilities', () => {
  it('builds stable timestamped filenames', () => {
    expect(buildTimestampedFilename('colmap-view', 'webm', new Date('2026-05-29T12:34:56Z')))
      .toBe('colmap-view-20260529T123456.webm');
  });

  it('triggers downloads for existing URLs without owning their lifetime', () => {
    const clickSpy = vi.fn();
    const anchor = buildAnchorElement({ click: clickSpy });
    const createElementSpy = vi.spyOn(document, 'createElement').mockReturnValue(anchor);
    const revokeSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);

    try {
      downloadUrl('blob:test-url', 'capture.gif');

      expect(createElementSpy).toHaveBeenCalledWith('a');
      expect(anchor.href).toBe('blob:test-url');
      expect(anchor.download).toBe('capture.gif');
      expect(clickSpy).toHaveBeenCalledOnce();
      expect(revokeSpy).not.toHaveBeenCalled();
    } finally {
      createElementSpy.mockRestore();
      revokeSpy.mockRestore();
    }
  });
});
