import { describe, expect, it } from 'vitest';
import { buttonStyles } from '../../theme';
import {
  getShareButtonClass,
  getShareButtonDisplayState,
  getShareSource,
  shouldRenderShareButton,
} from './shareButtonPolicy';
import type { ColmapManifest } from '../../types/manifest';

const manifest: ColmapManifest = {
  version: 1,
  baseUrl: 'https://example.test/data/',
  files: {
    cameras: 'cameras.bin',
    images: 'images.bin',
    points3D: 'points3D.bin',
  },
};

describe('share button policy', () => {
  it('renders only for URL-addressable reconstructions outside embed mode', () => {
    expect(shouldRenderShareButton({
      sourceType: 'url',
      hasReconstruction: true,
      embedMode: false,
    })).toBe(true);
    expect(shouldRenderShareButton({
      sourceType: 'manifest',
      hasReconstruction: true,
      embedMode: false,
    })).toBe(true);
    expect(shouldRenderShareButton({
      sourceType: 'local',
      hasReconstruction: true,
      embedMode: false,
    })).toBe(false);
    expect(shouldRenderShareButton({
      sourceType: 'zip',
      hasReconstruction: true,
      embedMode: false,
    })).toBe(false);
    expect(shouldRenderShareButton({
      sourceType: 'url',
      hasReconstruction: false,
      embedMode: false,
    })).toBe(false);
    expect(shouldRenderShareButton({
      sourceType: 'url',
      hasReconstruction: true,
      embedMode: true,
    })).toBe(false);
  });

  it('prefers source URL over inline manifest for share payloads', () => {
    expect(getShareSource('https://example.test/manifest.json', manifest)).toBe(
      'https://example.test/manifest.json'
    );
    expect(getShareSource(null, manifest)).toBe(manifest);
    expect(getShareSource(null, null)).toBeNull();
  });

  it('derives rounded and copied button classes', () => {
    expect(getShareButtonClass(false, 'left')).toContain('rounded-l');
    expect(getShareButtonClass(false, 'middle')).toContain('rounded-none');
    expect(getShareButtonClass(false, 'right')).toContain('rounded-r');
    expect(getShareButtonClass(false)).toContain('rounded');
    expect(getShareButtonClass(false)).toContain('bg-ds-secondary/50');
    expect(getShareButtonClass(true)).toContain(buttonStyles.variants.toggleSuccess);
    expect(getShareButtonClass(true)).toContain('border-0');
  });

  it('derives default display state for share actions', () => {
    expect(getShareButtonDisplayState('share', false)).toEqual({
      iconKind: 'share',
      label: 'Share',
      title: 'Copy shareable link to clipboard',
    });
    expect(getShareButtonDisplayState('copyLink', false)).toEqual({
      iconKind: 'link',
      label: 'copy',
      title: 'Copy shareable link to clipboard',
    });
    expect(getShareButtonDisplayState('embedUrl', false)).toEqual({
      iconKind: 'embed',
      label: 'embed',
      title: 'Copy embed URL to clipboard',
    });
    expect(getShareButtonDisplayState('embedHtml', false)).toEqual({
      iconKind: 'embed',
      label: '<embed>',
      title: 'Copy iframe HTML to clipboard',
    });
  });

  it('derives copied display state for share actions', () => {
    expect(getShareButtonDisplayState('share', true)).toEqual({
      iconKind: 'check',
      label: 'Copied!',
      title: 'Link copied!',
    });
    expect(getShareButtonDisplayState('embedUrl', true)).toEqual({
      iconKind: 'check',
      label: 'Copied!',
      title: 'Embed URL copied!',
    });
    expect(getShareButtonDisplayState('embedHtml', true)).toEqual({
      iconKind: 'check',
      label: 'Copied!',
      title: 'HTML copied!',
    });
  });
});
