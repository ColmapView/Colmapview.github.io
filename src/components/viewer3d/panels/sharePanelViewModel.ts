import type { CSSProperties } from 'react';
import type { CameraViewState } from '../../../store/types';
import type { Reconstruction } from '../../../types/colmap';
import type { ColmapManifest } from '../../../types/manifest';

export type ShareSource = string | ColmapManifest | null;

export function getShareSource(
  sourceUrl: string | null,
  sourceManifest: ColmapManifest | null
): ShareSource {
  return sourceUrl ?? sourceManifest;
}

export function canShareReconstruction(
  shareSource: ShareSource,
  reconstruction: Reconstruction | null
): boolean {
  return Boolean(shareSource && reconstruction);
}

export function formatShareCount(count: number): string {
  if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
  if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
  return count.toString();
}

export interface BuildSocialShareTextOptions {
  reconstruction: Reconstruction | null;
  withShareLink: boolean;
}

export function buildSocialShareText({
  reconstruction,
  withShareLink,
}: BuildSocialShareTextOptions): string {
  const parts: string[] = [];

  if (reconstruction) {
    const numPoints = reconstruction.globalStats?.totalPoints ?? 0;
    const numImages = reconstruction.images.size;
    const numCameras = reconstruction.cameras.size;

    if (numPoints > 0) {
      parts.push(`📍 ${formatShareCount(numPoints)} points`);
    }
    if (numImages > 0) {
      parts.push(`🖼️ ${numImages} images`);
    }
    if (numCameras > 1) {
      parts.push(`📷 ${numCameras} cameras`);
    }
  }

  const hashtags = '#3DReconstruction #Photogrammetry #COLMAP';
  const attribution = withShareLink
    ? 'Made with ColmapView by @opsiclear'
    : 'Made with https://colmapview.github.io/ by @opsiclear';
  const placeholder = '[type something here ...]';

  if (parts.length > 0) {
    return `${placeholder}\n\n${parts.join(' | ')}\n\n${hashtags}\n${attribution}`;
  }
  return `${placeholder}\n\n${hashtags}\n${attribution}`;
}

export interface BuildSocialSharePayloadOptions {
  currentViewState: CameraViewState | null;
  generateShareableUrl: (source: ShareSource, viewState: CameraViewState | null) => string;
  includeShareLink: boolean;
  reconstruction: Reconstruction | null;
  shareSource: ShareSource;
}

export interface SocialSharePayload {
  text: string;
  url: string | null;
}

export function buildSocialSharePayload({
  currentViewState,
  generateShareableUrl,
  includeShareLink,
  reconstruction,
  shareSource,
}: BuildSocialSharePayloadOptions): SocialSharePayload {
  const url = shareSource ? generateShareableUrl(shareSource, currentViewState) : null;
  const willIncludeLink = includeShareLink && Boolean(url);
  const text = buildSocialShareText({ reconstruction, withShareLink: willIncludeLink });

  return {
    text,
    url: willIncludeLink ? url : null,
  };
}

export function buildXShareUrl({ text, url }: SocialSharePayload): string {
  const baseUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
  return url ? `${baseUrl}&url=${encodeURIComponent(url)}` : baseUrl;
}

export function buildLinkedInShareContent({ text, url }: SocialSharePayload): string {
  return url ? `${text}\n${url}` : text;
}

export function getSocialShareButtonStyle(): CSSProperties {
  return { flex: 1, padding: '8px' };
}
