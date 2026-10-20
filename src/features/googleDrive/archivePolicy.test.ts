import { describe, expect, it } from 'vitest';
import { normalizeDriveArchiveName } from './archivePolicy';

describe('Drive archive name policy', () => {
  it.each(['', '../dataset', 'folder/name', 'line\nname', '.'])('rejects invalid file names: %s', name => {
    expect(() => normalizeDriveArchiveName(name)).toThrow('file name');
  });
});
