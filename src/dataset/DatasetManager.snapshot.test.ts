import { afterEach, describe, expect, it, vi } from 'vitest';
import { DatasetManager } from './DatasetManager';
import type { DatasetState } from './types';
import { buildArchiveEntry, buildArchiveReader, buildFile } from '../test/builders';
import { clearActiveZipArchive, setActiveZipArchive } from '../utils/zipArchiveState';
import { clearZipCache } from '../utils/zipImageFiles';

function source(sourceType: 'local' | 'zip', files: Map<string, File>) {
  if (sourceType === 'zip') {
    setActiveZipArchive(buildArchiveReader(), new Map([...files].map(([path, file]) => [
      path, buildArchiveEntry({ extract: async () => file }),
    ])));
  }
  const state: DatasetState = {
    sourceType, imageUrlBase: null, maskUrlBase: null,
    loadedFiles: { imageFiles: files, hasMasks: true },
  };
  return new DatasetManager(() => state);
}

afterEach(() => { clearActiveZipArchive(); clearZipCache(); vi.unstubAllGlobals(); });

describe.each(['local', 'zip'] as const)('DatasetManager %s snapshot masks', sourceType => {
  it('retains a viewer-resolved mask whose full nested name differs in case', async () => {
    const mask = buildFile('photo.png', 'original soft mask bytes', 'image/png');
    const manager = source(sourceType, new Map([['masks/camera/photo.png', mask]]));
    expect(await manager.getMask('Camera/Photo.PNG')).toBe(mask);
    const snapshot = manager.snapshot(['Camera/Photo.PNG']);
    expect(snapshot.hasMask('Camera/Photo.PNG')).toBe(true);
    expect(await snapshot.getMask('Camera/Photo.PNG')).toBe(mask);
  });

  it('normalizes separators and image prefixes while retaining equal basenames in separate cameras', async () => {
    const left = buildFile('photo.png', 'left mask');
    const right = buildFile('photo.png', 'right mask');
    const manager = source(sourceType, new Map([
      ['MASKS\\Left\\Photo.PNG', left], ['masks/right/photo.png.png', right],
      ['masks/photo.png', buildFile('photo.png', 'unassociated basename mask')],
    ]));
    const snapshot = manager.snapshot(['IMAGES/left/photo.png', 'RIGHT\\PHOTO.PNG', 'absent/photo.png']);
    expect(await snapshot.getMask('IMAGES/left/photo.png')).toBe(left);
    expect(await snapshot.getMask('RIGHT\\PHOTO.PNG')).toBe(right);
    expect(snapshot.hasMask('absent/photo.png')).toBe(false);
    expect(await snapshot.getMask('absent/photo.png')).toBeNull();
  });

  it('prefers exact full paths and rejects ambiguous case-insensitive matches', async () => {
    const upper = buildFile('Photo.png', 'upper');
    const lower = buildFile('photo.png', 'lower');
    const manager = source(sourceType, new Map([
      ['masks/Camera/Photo.png', upper], ['masks/camera/photo.png', lower],
    ]));
    const snapshot = manager.snapshot(['Camera/Photo.png', 'camera/photo.png', 'CAMERA/PHOTO.PNG']);
    expect(await snapshot.getMask('Camera/Photo.png')).toBe(upper);
    expect(await snapshot.getMask('camera/photo.png')).toBe(lower);
    expect(snapshot.hasMask('CAMERA/PHOTO.PNG')).toBe(false);
    expect(await snapshot.getMask('CAMERA/PHOTO.PNG')).toBeNull();
  });
});
