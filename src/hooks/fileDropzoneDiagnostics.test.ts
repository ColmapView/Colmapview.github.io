import { describe, expect, it, vi } from 'vitest';
import {
  getDecodeFailureDiagnostic,
  getMissingImageDiagnostic,
  logFileDropzoneDiagnostics,
  shouldSkipMissingImageDiagnosticForSource,
} from './fileDropzoneDiagnostics';

function createMissingImages(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    imageId: index + 1,
    name: `images/frame-${index + 1}.jpg`,
  }));
}

describe('file dropzone diagnostics', () => {
  it('does not report missing-image diagnostics when every image has a file', () => {
    expect(getMissingImageDiagnostic({
      missingImages: [],
      totalImages: 3,
      totalFiles: 3,
    })).toBeNull();
  });

  it('formats missing-image summary, samples, and overflow count', () => {
    const diagnostic = getMissingImageDiagnostic({
      missingImages: createMissingImages(12),
      totalImages: 20,
      totalFiles: 8,
    });

    expect(diagnostic).toEqual({
      summaryMessage: '⚠️ 12/20 images could not find their files (8 image files in lookup map)',
      sampleLabel: 'First missing images:',
      sampleImages: [
        'ID 1: "images/frame-1.jpg"',
        'ID 2: "images/frame-2.jpg"',
        'ID 3: "images/frame-3.jpg"',
        'ID 4: "images/frame-4.jpg"',
        'ID 5: "images/frame-5.jpg"',
        'ID 6: "images/frame-6.jpg"',
        'ID 7: "images/frame-7.jpg"',
        'ID 8: "images/frame-8.jpg"',
        'ID 9: "images/frame-9.jpg"',
        'ID 10: "images/frame-10.jpg"',
      ],
      overflowMessage: '... and 2 more',
    });
  });

  it('does not report decode diagnostics when no images failed to decode', () => {
    expect(getDecodeFailureDiagnostic(0)).toBeNull();
  });

  it('formats decode failure diagnostics', () => {
    expect(getDecodeFailureDiagnostic(3)).toEqual({
      summaryMessage: '⚠️ 3 images failed to decode (createImageBitmap error). These images may be corrupted or use unsupported encoding.',
      fixMessage: 'To fix: Re-export these images from your image editing software, or convert them using a tool like ImageMagick.',
    });
  });

  it('logs diagnostics in the same order as the dropzone hook expects', () => {
    const warn = vi.fn();

    logFileDropzoneDiagnostics({
      missingImages: createMissingImages(11),
      totalImages: 12,
      totalFiles: 1,
    }, 2, warn);

    expect(warn).toHaveBeenNthCalledWith(
      1,
      '⚠️ 11/12 images could not find their files (1 image files in lookup map)'
    );
    expect(warn).toHaveBeenNthCalledWith(
      2,
      'First missing images:',
      [
        'ID 1: "images/frame-1.jpg"',
        'ID 2: "images/frame-2.jpg"',
        'ID 3: "images/frame-3.jpg"',
        'ID 4: "images/frame-4.jpg"',
        'ID 5: "images/frame-5.jpg"',
        'ID 6: "images/frame-6.jpg"',
        'ID 7: "images/frame-7.jpg"',
        'ID 8: "images/frame-8.jpg"',
        'ID 9: "images/frame-9.jpg"',
        'ID 10: "images/frame-10.jpg"',
      ]
    );
    expect(warn).toHaveBeenNthCalledWith(3, '... and 1 more');
    expect(warn).toHaveBeenNthCalledWith(
      4,
      '⚠️ 2 images failed to decode (createImageBitmap error). These images may be corrupted or use unsupported encoding.'
    );
    expect(warn).toHaveBeenNthCalledWith(
      5,
      'To fix: Re-export these images from your image editing software, or convert them using a tool like ImageMagick.'
    );
  });

  it('can skip missing-image diagnostics for lazy URL image sources', () => {
    const warn = vi.fn();

    logFileDropzoneDiagnostics({
      missingImages: createMissingImages(3),
      totalImages: 3,
      totalFiles: 0,
    }, 1, warn, { skipMissingImageDiagnostic: true });

    expect(warn).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenNthCalledWith(
      1,
      '⚠️ 1 images failed to decode (createImageBitmap error). These images may be corrupted or use unsupported encoding.'
    );
  });

  it('skips missing-image diagnostics for lazy URL and ZIP sources', () => {
    expect(shouldSkipMissingImageDiagnosticForSource({
      sourceType: 'manifest',
      imageUrlBase: 'https://example.test/images/',
    })).toBe(true);
    expect(shouldSkipMissingImageDiagnosticForSource({
      sourceType: 'url',
      imageUrlBase: 'https://example.test/images/',
    })).toBe(true);
    expect(shouldSkipMissingImageDiagnosticForSource({
      sourceType: 'zip',
      imageUrlBase: null,
    })).toBe(true);
    expect(shouldSkipMissingImageDiagnosticForSource({
      sourceType: 'local',
      imageUrlBase: null,
    })).toBe(false);
  });
});
