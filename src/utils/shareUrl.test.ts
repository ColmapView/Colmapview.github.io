import { describe, expect, it } from 'vitest';
import type { CameraViewState } from '../store/types';
import type { ColmapManifest } from '../types/manifest';
import { decodeShareData, type ShareConfig } from './shareDataCodec';
import { decodeCameraStateBinary } from './urlCameraStateCodec';
import {
  buildEmbedUrl,
  buildShareableUrl,
  generateIframeHtml,
  getShareBaseUrl,
} from './shareUrl';

const viewState: CameraViewState = {
  position: [1, 2, 5],
  target: [1, -1, 1],
  quaternion: [0, Math.SQRT1_2, 0, Math.SQRT1_2],
  distance: 5,
};

const manifest: ColmapManifest = {
  version: 1,
  name: 'Example',
  baseUrl: 'https://example.com/data/',
  files: {
    cameras: 'sparse/0/cameras.bin',
    images: 'sparse/0/images.bin',
    points3D: 'sparse/0/points3D.bin',
  },
  imagesPath: 'images/',
};

describe('share URL helpers', () => {
  it('uses versioned production URLs on GitHub Pages', () => {
    expect(getShareBaseUrl({
      hostname: 'colmapview.github.io',
      origin: 'https://colmapview.github.io',
      pathname: '/latest/',
    }, '0.6.1')).toBe('https://colmapview.github.io/v0.6.1/');
  });

  it('uses the current origin and path for non-production hosts', () => {
    expect(getShareBaseUrl({
      hostname: 'localhost',
      origin: 'http://localhost:5173',
      pathname: '/viewer/',
    }, '0.6.1')).toBe('http://localhost:5173/viewer/');
  });

  it('builds camera-only share URLs when no manifest source is present', () => {
    const url = buildShareableUrl({
      baseUrl: 'http://localhost:5173/viewer/',
      manifestUrlOrManifest: null,
      viewState,
    });
    const cameraData = new URLSearchParams(new URL(url).hash.slice(1)).get('c');

    expect(cameraData).toBeTruthy();
    expect(decodeCameraStateBinary(cameraData!)?.distance).toBe(5);
  });

  it('builds combined share URLs for inline manifests with config', async () => {
    const config: ShareConfig = {
      ui: { backgroundColor: '#111111' },
      camera: { selectedImageId: 12 },
    };

    const url = buildShareableUrl({
      baseUrl: 'http://localhost:5173/viewer/',
      manifestUrlOrManifest: manifest,
      viewState,
      config,
    });

    const decoded = await decodeShareData(new URL(url).hash);

    expect(decoded?.manifest).toEqual(manifest);
    expect(decoded?.manifestUrl).toBeNull();
    expect(decoded?.config).toEqual(config);
    expect(decoded?.viewState?.position).toEqual(viewState.position);
  });

  it('adds embed mode before the hash without replacing existing query parameters', () => {
    expect(buildEmbedUrl('https://example.com/viewer/?foo=bar#c=abc'))
      .toBe('https://example.com/viewer/?foo=bar&embed=1#c=abc');
  });

  it('builds iframe embed snippets', () => {
    expect(generateIframeHtml('https://example.com/viewer/?embed=1#c=abc')).toBe(
      '<iframe src="https://example.com/viewer/?embed=1#c=abc" width="100%" height="600" frameborder="0" allowfullscreen></iframe>'
    );
  });
});
