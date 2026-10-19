import { describe, expect, it } from 'vitest';
import { googleDriveOpenWithHandoff, googleDriveOpenWithViewerUrl, parseGoogleDriveOpenWith } from './openWith';

const state = { action: 'open', ids: ['selected_file'], resourceKeys: { selected_file: 'resource-key' }, userId: '123456789' };
const launch = (value: unknown = state) => `?drive=open&state=${encodeURIComponent(JSON.stringify(value))}`;

describe('Drive Open with launch parsing', () => {
  it('ignores unrelated OAuth state and validates Drive file references', () => {
    expect(parseGoogleDriveOpenWith('?state=oauth')).toEqual({ kind: 'none' });
    expect(parseGoogleDriveOpenWith(launch())).toEqual({ kind: 'open', file: {
      fileId: 'selected_file', resourceKey: 'resource-key', userId: '123456789',
      sourceUrl: 'https://drive.google.com/file/d/selected_file/view?resourcekey=resource-key',
    } });
    expect(parseGoogleDriveOpenWith(launch({ action: 'open', ids: ['file'] }))).toMatchObject({ kind: 'open', file: { fileId: 'file' } });
  });
  it.each([
    null, [], { action: 'create', ids: ['file'] }, { action: 'open', ids: [] },
    { action: 'open', ids: [1] }, { ...state, ids: ['../other'] },
    { ...state, ids: ['file?x=1'] }, { ...state, ids: ['a'.repeat(201)] },
    { ...state, resourceKeys: [] }, { ...state, resourceKeys: null },
    { ...state, resourceKeys: { selected_file: 'x&token=secret' } },
    { ...state, resourceKeys: { selected_file: 2 } }, { ...state, userId: 'a@example.com' },
  ])('rejects invalid launch state without reflecting its contents: %j', value => {
    expect(parseGoogleDriveOpenWith(launch(value))).toMatchObject({ kind: 'error' });
  });
  it('rejects duplicate, malformed, double-encoded and oversized launch parameters', () => {
    for (const search of ['?drive=open', '?drive=open&state=%', '?drive=open&state=%257B%257D',
      `${launch()}&state={}`, `${launch()}&drive=other`, launch({ ...state, unused: 'x'.repeat(16_384) })]) {
      expect(parseGoogleDriveOpenWith(search)).toMatchObject({ kind: 'error' });
    }
  });
  it('explains single-file support and ignores unrelated provider-supplied URLs', () => {
    expect(parseGoogleDriveOpenWith(launch({ ...state, ids: ['a', 'b'] }))).toMatchObject({ kind: 'error', message: expect.stringContaining('one dataset') });
    const request = parseGoogleDriveOpenWith(launch({ ...state, url: 'https://untrusted.invalid', token: 'secret' }));
    expect(request.kind).toBe('open');
    if (request.kind !== 'open') return;
    const target = new URL(googleDriveOpenWithHandoff(request.file));
    expect(target.origin).toBe('https://colmapview.opsiclear.com');
    expect(parseGoogleDriveOpenWith(target.search)).toEqual(request);
    expect(target.href).not.toContain('untrusted');
    expect(target.href).not.toContain('secret');
  });
  it('replaces launch state with a canonical file link, removing the account hint and conflicting loads', () => {
    const request = parseGoogleDriveOpenWith(launch());
    const url = new URL(googleDriveOpenWithViewerUrl(`https://colmapview.opsiclear.com/${launch()}&url=other&touch=1#shared`, request));
    expect(url.searchParams.has('state')).toBe(false);
    expect(url.searchParams.has('drive')).toBe(false);
    expect(url.searchParams.get('touch')).toBe('1');
    expect(url.hash).toBe('');
    expect(url.searchParams.get('url')).toBe('https://drive.google.com/file/d/selected_file/view?resourcekey=resource-key');
    const invalid = new URL(googleDriveOpenWithViewerUrl(url.href, { kind: 'error', message: 'invalid' }));
    expect(invalid.searchParams.has('url')).toBe(false);
  });
});
