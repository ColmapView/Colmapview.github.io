import type { CameraViewState } from '../store/types';
import type { ColmapManifest } from '../types/manifest';
import { encodeShareData, type ShareConfig } from './shareDataCodec';
import { encodeCameraState } from './urlCameraStateCodec';

export interface ShareUrlLocation {
  hostname: string;
  origin: string;
  pathname: string;
}

export interface BuildShareableUrlOptions {
  baseUrl: string;
  manifestUrlOrManifest: string | ColmapManifest | null;
  viewState: CameraViewState | null;
  config?: ShareConfig | null;
}

export function getShareBaseUrl(location: ShareUrlLocation, appVersion: string): string {
  if (location.hostname === 'colmapview.github.io') {
    return `https://colmapview.github.io/v${appVersion}/`;
  }
  return location.origin + location.pathname;
}

export function buildShareableUrl({
  baseUrl,
  manifestUrlOrManifest,
  viewState,
  config,
}: BuildShareableUrlOptions): string {
  const url = new URL(baseUrl);

  if (manifestUrlOrManifest) {
    url.hash = encodeShareData(manifestUrlOrManifest, viewState, config);
    return url.toString();
  }

  if (viewState) {
    url.hash = encodeCameraState(viewState);
  }

  return url.toString();
}

export function buildEmbedUrl(shareableUrl: string): string {
  const url = new URL(shareableUrl);
  url.searchParams.set('embed', '1');
  return url.toString();
}

export function generateIframeHtml(embedUrl: string): string {
  return `<iframe src="${embedUrl}" width="100%" height="600" frameborder="0" allowfullscreen></iframe>`;
}
