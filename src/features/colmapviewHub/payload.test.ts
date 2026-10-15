import { describe, expect, it } from 'vitest';
import { buildHubPayload, hubText } from './payload';

const graphemes = (text: string) => [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text)].map(part => part.segment);

describe('hubText', () => {
  it('turns control characters into spaces and collapses whitespace like the Hub', () => {
    expect(hubText('  Scene\u0007\tname\n\u2028next  ', 120)).toBe('Scene name next');
  });

  it('keeps text within the limit unchanged', () => {
    expect(hubText('x'.repeat(120), 120)).toBe('x'.repeat(120));
  });

  it('cuts at the last space when that keeps at least 60% of the limit', () => {
    const text = hubText('word '.repeat(40), 120);
    expect(text.length).toBeLessThanOrEqual(120);
    expect(text.endsWith('word…')).toBe(true);
    expect(text.length).toBeGreaterThanOrEqual(72);
  });

  it('cuts at a grapheme boundary when the last space is too early', () => {
    const text = hubText(`a ${'x'.repeat(200)}`, 120);
    expect(text).toHaveLength(120);
    expect(text.endsWith('…')).toBe(true);
  });

  it('never splits an emoji sequence or a combining mark', () => {
    const emoji = hubText('👍🏽'.repeat(70), 120);
    expect(emoji.length).toBeLessThanOrEqual(120);
    expect(graphemes(emoji.slice(0, -1)).every(part => part === '👍🏽')).toBe(true);
    const combining = hubText('e\u0301'.repeat(100), 120);
    expect(graphemes(combining.slice(0, -1)).every(part => part === 'e\u0301')).toBe(true);
  });

  it('keeps graphemes whole in browsers without Intl.Segmenter', () => {
    const segmenter = Intl.Segmenter;
    Object.defineProperty(Intl, 'Segmenter', { value: undefined, configurable: true, writable: true });
    try {
      expect(hubText('e\u0301'.repeat(100), 120)).toBe(`${'e\u0301'.repeat(59)}…`);
      expect(hubText('👍🏽'.repeat(70), 120)).toBe(`${'👍🏽'.repeat(29)}…`);
      expect(hubText(`${'x'.repeat(115)}👩\u200d👩\u200d👧`, 120)).toBe(`${'x'.repeat(115)}…`);
    } finally {
      Object.defineProperty(Intl, 'Segmenter', { value: segmenter, configurable: true, writable: true });
    }
  });
});

describe('buildHubPayload', () => {
  const base = { viewerUrl: 'https://colmapview.opsiclear.com/?url=https://huggingface.co/datasets/user/scene', thumbnailBase64: 'jpeg',
    managementSecret: 'S'.repeat(43) };

  it('sends access and the acknowledgment, and never a listing choice', () => {
    const payload = buildHubPayload({ ...base, access: 'private', metadata: { title: 'Scene', description: 'Reconstruction' } });
    expect(payload).toEqual({ ...base, title: 'Scene', description: 'Reconstruction', access: 'private', publicAcknowledged: true });
    expect(payload).not.toHaveProperty('listed');
  });

  it('leaves access out of a public link, so a Hub that predates private links still accepts it', () => {
    const payload = buildHubPayload({ ...base, access: 'public', metadata: { title: 'Scene', description: 'Reconstruction' } });
    expect(payload).toEqual({ ...base, title: 'Scene', description: 'Reconstruction', publicAcknowledged: true });
    expect(payload).not.toHaveProperty('access');
  });

  it('falls back to a title when the given one is empty', () => {
    expect(buildHubPayload({ ...base, access: 'public', metadata: { title: ' \u0000 ' } }).title).toBe('ColmapView dataset');
  });

  it('sends a license name, and its URL only when it is a valid HTTPS link within the limit', () => {
    const payload = (url?: string) => buildHubPayload({ ...base, access: 'public', metadata: { title: 'Scene', license: { name: 'Custom', url } } }).license;
    expect(payload('https://example.com/license')).toEqual({ name: 'Custom', url: 'https://example.com/license' });
    expect(payload('http://example.com/license')).toEqual({ name: 'Custom' });
    expect(payload(`https://example.com/${'a'.repeat(2048)}`)).toEqual({ name: 'Custom' });
    // The Hub also caps the normalized link, where each '€' becomes nine characters.
    expect(payload(`https://example.com/${'€'.repeat(300)}`)).toEqual({ name: 'Custom' });
    expect(buildHubPayload({ ...base, access: 'public', metadata: { title: 'Scene', license: { name: '  ' } } })).not.toHaveProperty('license');
  });
});
