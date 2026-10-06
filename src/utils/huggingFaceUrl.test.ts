import { describe, expect, it } from 'vitest';
import { huggingFaceDatasetInfoUrl, huggingFaceDatasetReadRepoId, huggingFaceSettingsUrls, normalizeHuggingFaceDatasetUrl } from './huggingFaceUrl';
import { normalizeGitHostingUrl } from './urlUtils';

const root = 'https://huggingface.co/datasets/owner/scene';
describe('Hugging Face authenticated dataset endpoints', () => {
  it.each([
    root + '/resolve/main/images/photo.jpg', root + '/resolve/release%2Fv1/scene.tar?download=true',
    'https://huggingface.co/api/datasets/owner/scene',
    'https://huggingface.co/api/datasets/owner/scene/revision/release%2Fv1',
    'https://huggingface.co/api/datasets/owner/scene/tree/release%2Fv1/project?cursor=page2',
  ])('recognizes read endpoints without changing the URL: %s', url => {
    expect(huggingFaceDatasetReadRepoId(url)).toBe('owner/scene');
  });
  it.each(['', '/tree/release%2Fv1/folder', '/blob/abc/folder/colmapview.json', '/resolve/abc/scene.zip'])('checks repository permissions independently of the revision: %s', suffix => {
    expect(huggingFaceDatasetInfoUrl(root + suffix)).toBe('https://huggingface.co/api/datasets/owner/scene');
  });
  it.each([
    root, root + '/blob/main/scene.zip', root + '/settings',
    'http://huggingface.co/api/datasets/owner/scene', 'https://huggingface.co:444/api/datasets/owner/scene',
    'https://huggingface.co.evil.test/api/datasets/owner/scene',
    'https://token@huggingface.co/api/datasets/owner/scene',
    'https://huggingface.co/api/datasets/owner/scene/commit/main',
    'https://huggingface.co/api/datasets/owner/scene/revision/main/settings',
    'https://huggingface.co/datasets/owner%2Fother/scene/resolve/main/file',
    'https://huggingface.co/datasets/owner/scene%252Fother/resolve/main/file',
  ])('rejects unrelated endpoints and ambiguous repo identities: %s', url => {
    expect(huggingFaceDatasetReadRepoId(url)).toBeNull();
  });
});
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
