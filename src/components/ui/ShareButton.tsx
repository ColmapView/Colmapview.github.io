import { useCallback, useState } from 'react';
import { useThree } from '@react-three/fiber';
import { generateShareableUrl, generateEmbedUrl, generateIframeHtml, copyWithFeedback, getControlsViewState } from '../../hooks/useUrlState';
import { ShareIcon, CheckIcon, LinkIcon, EmbedIcon } from '../../icons';
import {
  getShareButtonClass,
  getShareButtonDisplayState,
  getShareSource,
  shouldRenderShareButton,
} from './shareButtonPolicy';
import type { ShareButtonIconKind, ShareSource } from './shareButtonPolicy';
import { useShareButtonStoreFacade } from './useShareButtonStoreFacade';

interface ShareButtonProps {
  className?: string;
}

function ShareButtonIcon({ iconKind }: { iconKind: ShareButtonIconKind }) {
  const className = 'w-4 h-4';

  if (iconKind === 'check') {
    return <CheckIcon className={className} />;
  }

  if (iconKind === 'link') {
    return <LinkIcon className={className} />;
  }

  if (iconKind === 'embed') {
    return <EmbedIcon className={className} />;
  }

  return <ShareIcon className={className} />;
}

/**
 * Button that copies a shareable URL with the current view to clipboard.
 * Visible when loaded from URL (sourceType === 'url') or manifest (sourceType === 'manifest').
 */
export function ShareButton({ className = '' }: ShareButtonProps) {
  const {
    data: {
      sourceType,
      sourceUrl,
      sourceManifest,
      reconstruction,
      embedMode,
    },
  } = useShareButtonStoreFacade();
  const [copied, setCopied] = useState(false);

  if (!shouldRenderShareButton({
    sourceType,
    hasReconstruction: reconstruction !== null,
    embedMode,
  })) {
    return null;
  }

  return (
    <ShareButtonInner
      shareSource={getShareSource(sourceUrl, sourceManifest)}
      copied={copied}
      setCopied={setCopied}
      className={className}
    />
  );
}

interface ShareButtonInnerProps {
  shareSource: ShareSource;
  copied: boolean;
  setCopied: (copied: boolean) => void;
  className: string;
}

/**
 * Inner component that uses R3F hooks (must be inside Canvas context)
 */
function ShareButtonInner({ shareSource, copied, setCopied, className }: ShareButtonInnerProps) {
  const { controls } = useThree();
  const display = getShareButtonDisplayState('share', copied);

  const handleShare = useCallback(async () => {
    const viewState = getControlsViewState(controls);
    const url = generateShareableUrl(shareSource, viewState);
    await copyWithFeedback(url, setCopied);
  }, [controls, shareSource, setCopied]);

  return (
    <button
      type="button"
      onClick={handleShare}
      className={`${getShareButtonClass(copied)} ${className}`}
      title={display.title}
    >
      <ShareButtonIcon iconKind={display.iconKind} />
      <span>{display.label}</span>
    </button>
  );
}

/**
 * Standalone ShareButton that doesn't require R3F context.
 * Uses currentViewState from store to include camera position in URL.
 * Shows both "Copy Link" and "Embed" buttons.
 * Visible when loaded from URL (sourceType === 'url') or manifest (sourceType === 'manifest').
 */
export function ShareButtonStandalone({ className = '' }: ShareButtonProps) {
  const {
    data: {
      sourceType,
      sourceUrl,
      sourceManifest,
      reconstruction,
      currentViewState,
      embedMode,
    },
  } = useShareButtonStoreFacade();
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedEmbedUrl, setCopiedEmbedUrl] = useState(false);
  const [copiedEmbedHtml, setCopiedEmbedHtml] = useState(false);

  if (!shouldRenderShareButton({
    sourceType,
    hasReconstruction: reconstruction !== null,
    embedMode,
  })) {
    return null;
  }

  const shareSource = getShareSource(sourceUrl, sourceManifest);
  const linkDisplay = getShareButtonDisplayState('copyLink', copiedLink);
  const embedUrlDisplay = getShareButtonDisplayState('embedUrl', copiedEmbedUrl);
  const embedHtmlDisplay = getShareButtonDisplayState('embedHtml', copiedEmbedHtml);

  const handleCopyLink = async () => {
    const url = generateShareableUrl(shareSource, currentViewState);
    await copyWithFeedback(url, setCopiedLink);
  };

  const handleCopyEmbedUrl = async () => {
    const embedUrl = generateEmbedUrl(shareSource, currentViewState);
    await copyWithFeedback(embedUrl, setCopiedEmbedUrl);
  };

  const handleCopyEmbedHtml = async () => {
    const embedUrl = generateEmbedUrl(shareSource, currentViewState);
    const iframeHtml = generateIframeHtml(embedUrl);
    await copyWithFeedback(iframeHtml, setCopiedEmbedHtml);
  };

  return (
    <div className={`flex items-center ${className}`}>
      <button
        type="button"
        onClick={handleCopyLink}
        className={getShareButtonClass(copiedLink, 'left')}
        title={linkDisplay.title}
      >
        <ShareButtonIcon iconKind={linkDisplay.iconKind} />
        <span>{linkDisplay.label}</span>
      </button>
      <button
        type="button"
        onClick={handleCopyEmbedUrl}
        className={getShareButtonClass(copiedEmbedUrl, 'middle')}
        title={embedUrlDisplay.title}
      >
        <ShareButtonIcon iconKind={embedUrlDisplay.iconKind} />
        <span>{embedUrlDisplay.label}</span>
      </button>
      <button
        type="button"
        onClick={handleCopyEmbedHtml}
        className={getShareButtonClass(copiedEmbedHtml, 'right')}
        title={embedHtmlDisplay.title}
      >
        <ShareButtonIcon iconKind={embedHtmlDisplay.iconKind} />
        <span>{embedHtmlDisplay.label}</span>
      </button>
    </div>
  );
}
