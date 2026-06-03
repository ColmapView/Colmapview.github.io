import type { CSSProperties } from 'react';
import { LINK_COLORS } from '../../theme/colors';

export type StatusBarLinkColor = keyof typeof LINK_COLORS;

export interface StatusBarLink {
  label: string;
  href: string;
  title: string;
  color: StatusBarLinkColor;
}

export const STATUS_BAR_LINK_CLASS_NAME = 'no-underline transition-colors';
export const STATUS_BAR_LINK_DEFAULT_COLOR = 'inherit';

export const STATUS_BAR_PROJECT_LINKS: StatusBarLink[] = [
  {
    label: '★ Star on GitHub',
    href: 'https://github.com/ColmapView/colmapview.github.io',
    title: 'Star on GitHub',
    color: 'github',
  },
  {
    label: 'Report Bugs',
    href: 'https://github.com/ColmapView/colmapview.github.io/issues',
    title: 'Report Bugs',
    color: 'bugs',
  },
];

export const STATUS_BAR_COLMAP_LINK: StatusBarLink = {
  label: 'COLMAP',
  href: 'https://github.com/colmap/colmap',
  title: 'COLMAP - Structure-from-Motion and Multi-View Stereo',
  color: 'colmap',
};

export function formatStatusBarFps(fps: number): string {
  return `${fps} FPS`;
}

export function getStatusBarLinkStyle(
  color = STATUS_BAR_LINK_DEFAULT_COLOR
): CSSProperties {
  return { color };
}

export function getStatusBarLinkHoverColor(link: StatusBarLink): string {
  return LINK_COLORS[link.color];
}

export function getStatusBarLinkRestColor(): string {
  return STATUS_BAR_LINK_DEFAULT_COLOR;
}

export function getDesktopEmptyStatusText({
  hasReconstruction,
  urlLoading,
}: {
  hasReconstruction: boolean;
  urlLoading: boolean;
}): string | null {
  if (hasReconstruction) return null;
  return urlLoading ? 'Loading...' : 'Drop COLMAP folder to load';
}

export function getTouchEmptyStatusText({
  hasReconstruction,
  urlLoading,
}: {
  hasReconstruction: boolean;
  urlLoading: boolean;
}): string | null {
  if (hasReconstruction) return null;
  return urlLoading ? 'Loading...' : '';
}

export function shouldShowStatusHistograms({
  hasReconstruction,
  hasGlobalStats,
}: {
  hasReconstruction: boolean;
  hasGlobalStats: boolean;
}): boolean {
  return hasReconstruction && hasGlobalStats;
}

export function shouldShowTouchStatusBar(statusBarVisible: boolean): boolean {
  return statusBarVisible;
}
