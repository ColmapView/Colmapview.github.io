import { afterEach, expect, it, vi } from 'vitest';
import { createVideoFrameFile, prepareVideoFrameExport } from './videoFrameFile';
import { convertToJpeg } from '../../utils/convertToJpeg';

vi.mock('../../utils/convertToJpeg', () => ({ convertToJpeg: vi.fn() }));
afterEach(() => vi.resetAllMocks());

it('keeps original files and lossless derived PNGs intact, encoding only JPEG-named derived exports', async () => {
  const source = new File(['original'], 'photo.jpg', { type: 'image/jpeg' });
  const derived = createVideoFrameFile(new Blob(['decoded pixels']), 'photo.jpg');
  const jpeg = new Blob(['encoded pixels'], { type: 'image/jpeg' });
  vi.mocked(convertToJpeg).mockResolvedValue(jpeg);
  expect(await prepareVideoFrameExport(source, source.name)).toBe(source);
  expect(await prepareVideoFrameExport(derived, 'lossless.png')).toBe(derived);
  expect(await prepareVideoFrameExport(derived, derived.name)).toBe(jpeg);
  expect(convertToJpeg).toHaveBeenCalledExactlyOnceWith(derived, 0.95, undefined);
  expect(derived.type).toBe('image/png');
  await expect(prepareVideoFrameExport(derived, 'photo.tiff')).rejects.toThrow('PNG or JPEG');
});
