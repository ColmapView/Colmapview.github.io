import { describe, expect, it } from 'vitest';
import {
  compareSplatCandidates,
  getPreferredSplatCandidate,
  getSplatFileExtension,
  isSplatFilePath,
} from './splatFilePolicy';

describe('splat file policy', () => {
  it('detects supported splat file extensions case-insensitively', () => {
    expect(getSplatFileExtension('scene.SPZ')).toBe('.spz');
    expect(getSplatFileExtension('scene.ply')).toBe('.ply');
    expect(getSplatFileExtension('points3D.bin')).toBeNull();
    expect(isSplatFilePath('folder/model.spz')).toBe(true);
    expect(isSplatFilePath('folder/model.txt')).toBe(false);
  });

  it('prefers largest SPZ, then largest PLY as fallback', () => {
    const smallSpz = { path: 'small.spz', size: 10 };
    const largeSpz = { path: 'large.spz', size: 20 };
    const hugePly = { path: 'huge.ply', size: 1_000 };
    const smallPly = { path: 'small.ply', size: 1 };

    expect(compareSplatCandidates(smallSpz, hugePly)).toBeGreaterThan(0);
    expect(compareSplatCandidates(largeSpz, smallSpz)).toBeGreaterThan(0);
    expect(compareSplatCandidates(hugePly, smallPly)).toBeGreaterThan(0);

    expect([
      hugePly,
      smallSpz,
      largeSpz,
      smallPly,
    ].reduce(getPreferredSplatCandidate)).toBe(largeSpz);
  });
});
