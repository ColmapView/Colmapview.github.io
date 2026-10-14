import { beforeEach, describe, expect, it } from 'vitest';
import { hubShareLinks } from './hubShareLinks';

const source = { key: '1:url:https://example.test/a/:', revision: 2 };
beforeEach(() => { for (const provider of ['huggingFace', 'googleDrive', 'bucket']) hubShareLinks.set(provider, null); });

describe('hubShareLinks', () => {
  it('offers the newest ready link made from exactly this dataset state', () => {
    hubShareLinks.set('huggingFace', { url: 'https://hub.invalid/hub/Older', source, readyAt: 1 });
    hubShareLinks.set('googleDrive', { url: 'https://hub.invalid/hub/Newer', source, readyAt: 2 });
    hubShareLinks.set('bucket', { url: 'https://hub.invalid/hub/Other', source: { ...source, revision: 3 }, readyAt: 3 });
    expect(hubShareLinks.match(source, 0)).toBe('https://hub.invalid/hub/Newer');
    expect(hubShareLinks.match({ ...source, key: 'other' }, 0)).toBeNull();
  });

  it('offers nothing while deletions are pending, and forgets a provider\'s link', () => {
    hubShareLinks.set('huggingFace', { url: 'https://hub.invalid/hub/One', source, readyAt: 1 });
    expect(hubShareLinks.match(source, 1)).toBeNull();
    const version = hubShareLinks.getVersion();
    hubShareLinks.set('huggingFace', null);
    expect(hubShareLinks.getVersion()).toBe(version + 1);
    expect(hubShareLinks.match(source, 0)).toBeNull();
  });
});
