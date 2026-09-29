import { describe, expect, it } from 'vitest';
import { huggingFaceSettingsUrls, normalizeHuggingFaceDatasetUrl } from './huggingFaceUrl';
import { normalizeGitHostingUrl } from './urlUtils';

const root = 'https://huggingface.co/datasets/owner/scene';
describe('Hugging Face dataset settings paths', () => {
  it.each(['', '/', '/tree/main', '/tree/main/'])('supports repository and tree roots: %s', suffix => {
    expect(normalizeGitHostingUrl(root + suffix).replace(/\/$/, '')).toBe(root + '/resolve/main');
    expect(huggingFaceSettingsUrls(root + suffix, 'colmapview.yaml')).toEqual([root + '/resolve/main/colmapview.yaml']);
  });

  it('preserves pinned and encoded revisions while searching from project folder to repository root', () => {
    expect(huggingFaceSettingsUrls(root + '/tree/release%2Fv1/scenes/room%20one', 'colmapview.yaml')).toEqual([
      root + '/resolve/release%2Fv1/scenes/room%20one/colmapview.yaml',
      root + '/resolve/release%2Fv1/scenes/colmapview.yaml',
      root + '/resolve/release%2Fv1/colmapview.yaml',
    ]);
  });

  it('searches beside a file, strips query strings and bounds ancestor probes', () => {
    expect(huggingFaceSettingsUrls(root + '/blob/abc/splats/file.spz?download=true', 'colmapview.yaml', true)).toEqual([
      root + '/resolve/abc/splats/colmapview.yaml', root + '/resolve/abc/colmapview.yaml',
    ]);
    const candidates = huggingFaceSettingsUrls(root + '/resolve/abc/' + 'deep/'.repeat(100), 'colmapview.yaml');
    expect(candidates).toHaveLength(8);
    expect(candidates.at(-1)).toBe(root + '/resolve/abc/colmapview.yaml');
  });

  it.each(['https://example.com/datasets/owner/scene', 'https://huggingface.co.evil.test/datasets/owner/scene',
    'https://token@huggingface.co/datasets/owner/scene', 'https://huggingface.co/datasets/owner/scene/discussions', 'invalid'])(
    'does not probe other hosts, credentialed URLs or non-data pages: %s', url => {
      expect(normalizeHuggingFaceDatasetUrl(url)).toBeNull();
      expect(huggingFaceSettingsUrls(url, 'colmapview.yaml')).toEqual([]);
    });
});
