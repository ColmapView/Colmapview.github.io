import { useCallback, useState } from 'react';
import { useThree } from '@react-three/fiber';
import { useReconstructionStore, useCameraStore, useUIStore } from '../../store';
import { generateShareableUrl, generateEmbedUrl, generateIframeHtml, copyWithFeedback, getControlsViewState } from '../../hooks/useUrlState';
import { ShareIcon, CheckIcon, LinkIcon, EmbedIcon } from '../../icons';
import { buttonStyles } from '../../theme';
import type { ColmapManifest } from '../../types/manifest';

// Helper for share button styling with copied state
function getShareButtonClass(copied: boolean, rounded: 'full' | 'left' | 'middle' | 'right' = 'full'): string {
  let roundedClass: string;
  switch (rounded) {
    case 'left':
      roundedClass = 'rounded-l';
      break;
    case 'right':
      roundedClass = 'rounded-r';
      break;
    case 'middle':
      roundedClass = 'rounded-none';
      break;
    default:
      roundedClass = 'rounded';
  }

  const baseClass = `${buttonStyles.base} ${buttonStyles.sizes.sm} ${roundedClass}`;
  const variantClass = copied
    ? `${buttonStyles.variants.toggleSuccess} border-0`
    : 'bg-ds-secondary/50 text-ds-muted hover:text-ds-primary hover:bg-ds-secondary';
  return `${baseClass} ${variantClass}`;
}

interface ShareButtonProps {
  className?: string;
}

/**
 * Button that copies a shareable URL with the current view to clipboard.
 * Visible when loaded from URL (sourceType === 'url') or manifest (sourceType === 'manifest').
 */
export function ShareButton({ className = '' }: ShareButtonProps) {
  const sourceType = useReconstructionStore((s) => s.sourceType);
  const sourceUrl = useReconstructionStore((s) => s.sourceUrl);
  const sourceManifest = useReconstructionStore((s) => s.sourceManifest);
  const reconstruction = useReconstructionStore((s) => s.reconstruction);
  const embedMode = useUIStore((s) => s.embedMode);
  const [copied, setCopied] = useState(false);

  // Show when loaded from URL or manifest and not in embed mode
  const canShare = (sourceType === 'url' || sourceType === 'manifest') && reconstruction && !embedMode;
  if (!canShare) {
    return null;
  }

  // Use sourceUrl if available, otherwise use sourceManifest for inline embedding
  const shareSource: string | ColmapManifest | null = sourceUrl ?? sourceManifest;

  return (
    <ShareButtonInner
      shareSource={shareSource}
      copied={copied}
      setCopied={setCopied}
      className={className}
    />
  );
}

interface ShareButtonInnerProps {
  shareSource: string | ColmapManifest | null;
  copied: boolean;
  setCopied: (copied: boolean) => void;
  className: string;
}

/**
 * Inner component that uses R3F hooks (must be inside Canvas context)
 */
function ShareButtonInner({ shareSource, copied, setCopied, className }: ShareButtonInnerProps) {
  const { controls } = useThree();

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
      title={copied ? 'Link copied!' : 'Copy shareable link to clipboard'}
    >
      {copied ? (
        <>
          <CheckIcon className="w-4 h-4" />
          <span>Copied!</span>
        </>
      ) : (
        <>
          <ShareIcon className="w-4 h-4" />
          <span>Share</span>
        </>
      )}
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
  const sourceType = useReconstructionStore((s) => s.sourceType);
  const sourceUrl = useReconstructionStore((s) => s.sourceUrl);
  const sourceManifest = useReconstructionStore((s) => s.sourceManifest);
  const reconstruction = useReconstructionStore((s) => s.reconstruction);
  const currentViewState = useCameraStore((s) => s.currentViewState);
  const embedMode = useUIStore((s) => s.embedMode);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedEmbedUrl, setCopiedEmbedUrl] = useState(false);
  const [copiedEmbedHtml, setCopiedEmbedHtml] = useState(false);

  // Show when loaded from URL or manifest and not in embed mode
  const canShare = (sourceType === 'url' || sourceType === 'manifest') && reconstruction && !embedMode;
  if (!canShare) {
    return null;
  }

  // Use sourceUrl if available, otherwise use sourceManifest for inline embedding
  const shareSource: string | ColmapManifest | null = sourceUrl ?? sourceManifest;

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
        title={copiedLink ? 'Link copied!' : 'Copy shareable link to clipboard'}
      >
        {copiedLink ? (
          <>
            <CheckIcon className="w-4 h-4" />
            <span>Copied!</span>
          </>
        ) : (
          <>
            <LinkIcon className="w-4 h-4" />
            <span>copy</span>
          </>
        )}
      </button>
      <button
        type="button"
        onClick={handleCopyEmbedUrl}
        className={getShareButtonClass(copiedEmbedUrl, 'middle')}
        title={copiedEmbedUrl ? 'Embed URL copied!' : 'Copy embed URL to clipboard'}
      >
        {copiedEmbedUrl ? (
          <>
            <CheckIcon className="w-4 h-4" />
            <span>Copied!</span>
          </>
        ) : (
          <>
            <EmbedIcon className="w-4 h-4" />
            <span>embed</span>
          </>
        )}
      </button>
      <button
        type="button"
        onClick={handleCopyEmbedHtml}
        className={getShareButtonClass(copiedEmbedHtml, 'right')}
        title={copiedEmbedHtml ? 'HTML copied!' : 'Copy iframe HTML to clipboard'}
      >
        {copiedEmbedHtml ? (
          <>
            <CheckIcon className="w-4 h-4" />
            <span>Copied!</span>
          </>
        ) : (
          <>
            <EmbedIcon className="w-4 h-4" />
            <span>&lt;embed&gt;</span>
          </>
        )}
      </button>
    </div>
  );
}
