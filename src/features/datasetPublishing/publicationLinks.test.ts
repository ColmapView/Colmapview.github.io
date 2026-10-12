import { describe, expect, it } from 'vitest';
import { getPublicationViewerBaseUrl, makePublicationViewerLink } from './publicationLinks';

describe('publication links', () => {
  it.each([
    'https://huggingface.co/datasets/owner/scene',
    'https://huggingface.co/datasets/owner/scene/resolve/revision/dataset.zip',
    'https://drive.google.com/file/d/example/view',
    'https://bucket.example/scenes/name%20%2B%23%26/dataset.zip',
    'https://bucket.example/dataset.zip?version=1&tag=one+two#part',
  ])('round-trips the entire source URL and removes previous viewer state: %s', source => {
    const link = new URL(makePublicationViewerLink('https://viewer.example/latest/?url=old&profile=old#camera=old', source));
    expect(link.searchParams.get('url')).toBe(source);
    expect([...link.searchParams.keys()]).toEqual(['url']);
    expect(link.hash).toBe('');
    expect(link.pathname).toBe('/latest/');
  });

  it('keeps ordinary dataset links readable', () => {
    expect(makePublicationViewerLink('https://viewer.example/', 'https://huggingface.co/datasets/owner/scene'))
      .toBe('https://viewer.example/?url=https://huggingface.co/datasets/owner/scene');
  });

  it.each([
    ['https://colmapview.github.io', '/v0.15.2/', 'https://colmapview.github.io/latest/'],
    ['https://colmapview.github.io', '/latest/', 'https://colmapview.github.io/latest/'],
    ['https://colmapview.github.io', '/dev/', 'https://colmapview.github.io/dev/'],
    ['http://localhost:5173', '/', 'http://localhost:5173/'],
  ])('links %s%s datasets to %s', (origin, pathname, expected) => {
    const { hostname } = new URL(origin);
    expect(getPublicationViewerBaseUrl({ origin, hostname, pathname })).toBe(expected);
  });
});
