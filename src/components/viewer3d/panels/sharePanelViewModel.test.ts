import { describe, expect, it, vi } from 'vitest';
import type { CameraViewState } from '../../../store/types';
import type { ColmapManifest } from '../../../types/manifest';
import { buildCamera, buildImage, buildReconstruction } from '../../../test/builders';
import {
  buildLinkedInShareContent,
  buildSocialSharePayload,
  buildSocialShareText,
  buildXShareUrl,
  canShareReconstruction,
  formatShareCount,
  getSocialShareButtonStyle,
  getShareSource,
} from './sharePanelViewModel';

const manifest: ColmapManifest = {
  version: 1,
  baseUrl: 'https://example.com/dataset/',
  files: {
    cameras: 'sparse/cameras.bin',
    images: 'sparse/images.bin',
    points3D: 'sparse/points3D.bin',
  },
};

const viewState: CameraViewState = {
  position: [1, 2, 3],
  quaternion: [1, 0, 0, 0],
  target: [0, 0, 0],
  distance: 4,
};

describe('share panel view-model helpers', () => {
  it('chooses URL-addressable share sources and gates share actions', () => {
    const reconstruction = buildReconstruction();

    expect(getShareSource('https://example.com/manifest.json', manifest)).toBe('https://example.com/manifest.json');
    expect(getShareSource(null, manifest)).toBe(manifest);
    expect(getShareSource(null, null)).toBeNull();

    expect(canShareReconstruction('https://example.com/manifest.json', reconstruction)).toBe(true);
    expect(canShareReconstruction(manifest, reconstruction)).toBe(true);
    expect(canShareReconstruction(null, reconstruction)).toBe(false);
    expect(canShareReconstruction(manifest, null)).toBe(false);
  });

  it('formats social share counts with the existing suffix thresholds', () => {
    expect(formatShareCount(999)).toBe('999');
    expect(formatShareCount(1000)).toBe('1.0K');
    expect(formatShareCount(12500)).toBe('12.5K');
    expect(formatShareCount(1000000)).toBe('1.0M');
  });

  it('builds social share text from reconstruction stats and attribution mode', () => {
    const reconstruction = buildReconstruction({
      cameras: [
        buildCamera({ cameraId: 1 }),
        buildCamera({ cameraId: 2 }),
      ],
      images: [
        buildImage({ imageId: 1, cameraId: 1 }),
        buildImage({ imageId: 2, cameraId: 2 }),
      ],
      globalStats: { totalPoints: 12500 },
    });

    const withLink = buildSocialShareText({ reconstruction, withShareLink: true });
    expect(withLink).toContain('12.5K points');
    expect(withLink).toContain('2 images');
    expect(withLink).toContain('2 cameras');
    expect(withLink).toContain('Made with ColmapView by @opsiclear');
    expect(withLink).not.toContain('https://colmapview.github.io/');

    const withoutLink = buildSocialShareText({ reconstruction: null, withShareLink: false });
    expect(withoutLink).toContain('#3DReconstruction #Photogrammetry #COLMAP');
    expect(withoutLink).toContain('Made with https://colmapview.github.io/ by @opsiclear');
  });

  it('builds social share payloads without duplicating URLs in the message body', () => {
    const reconstruction = buildReconstruction();
    const generateShareableUrl = vi.fn(() => 'https://viewer.example/share#state');

    const payload = buildSocialSharePayload({
      currentViewState: viewState,
      generateShareableUrl,
      includeShareLink: true,
      reconstruction,
      shareSource: manifest,
    });

    expect(generateShareableUrl).toHaveBeenCalledWith(manifest, viewState);
    expect(payload.url).toBe('https://viewer.example/share#state');
    expect(payload.text).toContain('Made with ColmapView by @opsiclear');
    expect(payload.text).not.toContain('https://viewer.example/share#state');

    const noLinkPayload = buildSocialSharePayload({
      currentViewState: null,
      generateShareableUrl,
      includeShareLink: false,
      reconstruction,
      shareSource: manifest,
    });

    expect(noLinkPayload.url).toBeNull();
    expect(noLinkPayload.text).toContain('https://colmapview.github.io/');
  });

  it('builds platform-specific share URLs and copied LinkedIn content', () => {
    const payload = {
      text: 'hello world',
      url: 'https://viewer.example/share#state',
    };

    expect(buildXShareUrl(payload)).toBe(
      'https://twitter.com/intent/tweet?text=hello%20world&url=https%3A%2F%2Fviewer.example%2Fshare%23state'
    );
    expect(buildXShareUrl({ text: 'hello world', url: null })).toBe(
      'https://twitter.com/intent/tweet?text=hello%20world'
    );
    expect(buildLinkedInShareContent(payload)).toBe('hello world\nhttps://viewer.example/share#state');
    expect(buildLinkedInShareContent({ text: 'hello world', url: null })).toBe('hello world');
  });

  it('builds the compact social share button style', () => {
    expect(getSocialShareButtonStyle()).toEqual({ flex: 1, padding: '8px' });
  });
});
