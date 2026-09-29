import { describe, expect, it } from 'vitest';
import {
  compareSplatCandidates,
  getPreferredSplatCandidate,
  getSplatFileExtension,
  getSplatRendererRequirement,
  isSogSplatPath,
  isSplatFilePath,
  supportsWebGpuRenderer,
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

  it('accepts SOG but never prefers it over PLY or SPZ', () => {
    expect(getSplatFileExtension('bicycle/splat_30000.SOG')).toBe('.sog');
    expect(isSplatFilePath('scene.sog')).toBe(true);
    const tinyPly = { path: 'scene.ply', size: 10 };
    const hugeSog = { path: 'scene.sog', size: 1_000 };
    expect(compareSplatCandidates(tinyPly, hugeSog)).toBeGreaterThan(0);
    expect([hugeSog, { path: 'other.sog', size: 5 }].reduce(getPreferredSplatCandidate)).toBe(hugeSog);
  });

  it('knows which formats the WebGPU decoders can read', () => {
    expect(supportsWebGpuRenderer('scene.PLY')).toBe(true);
    expect(supportsWebGpuRenderer('dir/scene.spz')).toBe(true);
    expect(supportsWebGpuRenderer('scene.sog')).toBe(false);
    expect(supportsWebGpuRenderer('scene.splat')).toBe(false);
  });

  it('marks SOG as renderable only by Spark', () => {
    expect(getSplatRendererRequirement('bicycle/splat_30000.SOG')).toBe('spark-only');
    expect(getSplatRendererRequirement('scene.ply')).toBe('any');
    expect(getSplatRendererRequirement(undefined)).toBe('any');
    expect(isSogSplatPath('a/b.sog')).toBe(true);
    expect(isSogSplatPath('a/b.ply')).toBe(false);
  });
});
