import { describe, expect, it } from 'vitest';
import {
  readBlobAsArrayBuffer,
} from '../test/builders';
import {
  createZipBlob,
  normalizeZipCompressionLevel,
  ZIP_MIME_TYPE,
} from './zipExportPolicy';

describe('normalizeZipCompressionLevel', () => {
  it('defaults missing or NaN values and clamps numeric levels', () => {
    expect(normalizeZipCompressionLevel()).toBe(6);
    expect(normalizeZipCompressionLevel(Number.NaN)).toBe(6);
    expect(normalizeZipCompressionLevel(-Infinity)).toBe(0);
    expect(normalizeZipCompressionLevel(-3)).toBe(0);
    expect(normalizeZipCompressionLevel(4.8)).toBe(4);
    expect(normalizeZipCompressionLevel(12)).toBe(9);
    expect(normalizeZipCompressionLevel(Infinity)).toBe(9);
  });
});

describe('createZipBlob', () => {
  it('creates an application ZIP blob with a stable byte snapshot', async () => {
    const zipped = new Uint8Array([1, 2, 3, 4]);

    const blob = createZipBlob(zipped);
    zipped.fill(9);

    expect(blob.type).toBe(ZIP_MIME_TYPE);
    expect(new Uint8Array(await readBlobAsArrayBuffer(blob))).toEqual(new Uint8Array([1, 2, 3, 4]));
  });
});
