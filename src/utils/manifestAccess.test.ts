import { describe, expect, it, vi } from 'vitest';
import { withManifestAccess } from './manifestAccess';
import { HfAccessDeniedError, HfError } from '../features/huggingface/http';
import type { ColmapManifest } from '../types/manifest';

const manifest: ColmapManifest = {
  version: 1, baseUrl: 'https://huggingface.co/datasets/owner/data/resolve/main/',
  files: { cameras: 'cameras.bin', images: 'images.bin' },
  access: [{ provider: 'huggingface', repository: 'owner/data', requirement: 'gated' }],
};
const url = manifest.baseUrl + manifest.files.cameras;

describe('manifest access hints', () => {
  it('leaves public successes alone, even when an old hint says gated', async () => {
    const response = new Response('ok');
    const fetch = vi.fn(async () => response);
    expect(await withManifestAccess(manifest, fetch)(url)).toBe(response);
    expect(fetch).toHaveBeenCalledExactlyOnceWith(url, undefined);
  });
  it('explains a matching provider denial and retains the existing login action', async () => {
    for (const status of [401, 403]) {
      const fetch = async () => new Response('', { status });
      await expect(withManifestAccess(manifest, fetch)(url)).rejects.toMatchObject({
        status, access: { provider: 'hf' }, message: expect.stringContaining('approved account'),
      });
    }
    const fetch = async () => { throw new HfError('Denied', 403); };
    await expect(withManifestAccess(manifest, fetch)(url)).rejects.toMatchObject({ access: { provider: 'hf' } });
    const anonymousDenial = async () => { throw new HfAccessDeniedError('Missing or private', 401); };
    await expect(withManifestAccess(manifest, anonymousDenial)(url)).rejects.toMatchObject({
      message: expect.stringContaining('approved account'),
    });
    const expired = new HfError('Connection expired', 401, false, { provider: 'hf' });
    await expect(withManifestAccess(manifest, async () => { throw expired; })(url)).rejects.toBe(expired);
  });
  it('never applies hints to other repositories, lookalike hosts, missing files or network errors', async () => {
    for (const target of [url.replace('/owner/data/', '/other/data/'), url.replace('huggingface.co', 'huggingface.co.evil.test')]) {
      expect((await withManifestAccess(manifest, async () => new Response('', { status: 403 }))(target)).status).toBe(403);
    }
    expect((await withManifestAccess(manifest, async () => new Response('', { status: 404 }))(url)).status).toBe(404);
    const error = new TypeError('Network unavailable');
    await expect(withManifestAccess(manifest, async () => { throw error; })(url)).rejects.toBe(error);
  });
  it('preserves cancellation instead of turning it into a login request', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(withManifestAccess(manifest, async () => new Response('', { status: 401 }))(url,
      { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
  });
});
