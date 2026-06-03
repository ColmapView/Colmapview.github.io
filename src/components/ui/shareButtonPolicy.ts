import { buttonStyles } from '../../theme';
import type { ReconstructionSourceType } from '../../store/reconstructionStore';
import type { ColmapManifest } from '../../types/manifest';

export type ShareButtonRounded = 'full' | 'left' | 'middle' | 'right';
export type ShareSource = string | ColmapManifest | null;
export type ShareButtonKind = 'share' | 'copyLink' | 'embedUrl' | 'embedHtml';
export type ShareButtonIconKind = 'share' | 'check' | 'link' | 'embed';

export interface ShareButtonVisibilityOptions {
  sourceType: ReconstructionSourceType;
  hasReconstruction: boolean;
  embedMode: boolean;
}

export interface ShareButtonDisplayState {
  iconKind: ShareButtonIconKind;
  label: string;
  title: string;
}

const ROUNDED_CLASSES: Record<ShareButtonRounded, string> = {
  full: 'rounded',
  left: 'rounded-l',
  middle: 'rounded-none',
  right: 'rounded-r',
};

const DEFAULT_DISPLAY: Record<ShareButtonKind, ShareButtonDisplayState> = {
  share: {
    iconKind: 'share',
    label: 'Share',
    title: 'Copy shareable link to clipboard',
  },
  copyLink: {
    iconKind: 'link',
    label: 'copy',
    title: 'Copy shareable link to clipboard',
  },
  embedUrl: {
    iconKind: 'embed',
    label: 'embed',
    title: 'Copy embed URL to clipboard',
  },
  embedHtml: {
    iconKind: 'embed',
    label: '<embed>',
    title: 'Copy iframe HTML to clipboard',
  },
};

const COPIED_TITLES: Record<ShareButtonKind, string> = {
  share: 'Link copied!',
  copyLink: 'Link copied!',
  embedUrl: 'Embed URL copied!',
  embedHtml: 'HTML copied!',
};

export function shouldRenderShareButton({
  sourceType,
  hasReconstruction,
  embedMode,
}: ShareButtonVisibilityOptions): boolean {
  return (sourceType === 'url' || sourceType === 'manifest')
    && hasReconstruction
    && !embedMode;
}

export function getShareSource(
  sourceUrl: string | null,
  sourceManifest: ColmapManifest | null
): ShareSource {
  return sourceUrl ?? sourceManifest;
}

export function getShareButtonClass(
  copied: boolean,
  rounded: ShareButtonRounded = 'full'
): string {
  const baseClass = `${buttonStyles.base} ${buttonStyles.sizes.sm} ${ROUNDED_CLASSES[rounded]}`;
  const variantClass = copied
    ? `${buttonStyles.variants.toggleSuccess} border-0`
    : 'bg-ds-secondary/50 text-ds-muted hover:text-ds-primary hover:bg-ds-secondary';

  return `${baseClass} ${variantClass}`;
}

export function getShareButtonDisplayState(
  kind: ShareButtonKind,
  copied: boolean
): ShareButtonDisplayState {
  if (copied) {
    return {
      iconKind: 'check',
      label: 'Copied!',
      title: COPIED_TITLES[kind],
    };
  }

  return DEFAULT_DISPLAY[kind];
}
