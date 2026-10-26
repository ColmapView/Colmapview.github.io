import { describe, expect, it } from 'vitest';
import { getHubBaseUrl, getHubCatalogUrl } from './config';

const production = { protocol: 'https:', hostname: 'colmapview.opsiclear.com' };

describe('getHubCatalogUrl', () => {
  it('opens the GitHub gallery for Explore Hub on the exact GitHub origin', () => {
    expect(getHubCatalogUrl({ origin: 'https://colmapview.github.io' }))
      .toBe('https://colmapview.github.io/hub/datasets/');
  });

  it.each(['https://colmapview.opsiclear.com', 'http://localhost:5173',
    'https://colmapview.github.io.evil.example', 'https://colmapview-preview.pages.dev'])(
    'keeps the normal catalog destination on %s', origin => {
      expect(getHubCatalogUrl({ origin })).toBe('https://colmapview.opsiclear.com/hub/datasets/');
    });
});

describe('getHubBaseUrl', () => {
  it('uses VITE_HUB_BASE_URL first, trimmed and without a trailing slash', () => {
    expect(getHubBaseUrl({ VITE_HUB_BASE_URL: ' http://localhost:5201/hub/ ' }, { protocol: 'http:', hostname: 'localhost' })).toBe('http://localhost:5201/hub');
  });

  it.each(['colmapview.opsiclear.com', 'colmapview.github.io'])('uses the production Hub on https://%s', hostname => {
    expect(getHubBaseUrl({}, { protocol: 'https:', hostname })).toBe('https://colmapview.opsiclear.com/hub');
  });

  it.each([['http:', 'localhost'], ['https:', 'colmapview-preview.pages.dev'], ['http:', 'colmapview.opsiclear.com']])('is off on %s//%s', (protocol, hostname) => {
    expect(getHubBaseUrl({}, { protocol, hostname })).toBeNull();
  });

  it.each(['ftp://hub.example/hub', 'https://hub.example/hub?debug=1', 'https://hub.example/hub#x', 'https://hub.example/hub?', 'https://hub.example/hub#',
    'https://user:pw@hub.example/hub', 'not a url'])(
    'is off for an invalid VITE_HUB_BASE_URL %s, even on a production host', value => {
      expect(getHubBaseUrl({ VITE_HUB_BASE_URL: value }, production)).toBeNull();
    });
});
