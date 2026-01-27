/**
 * Share panel extracted from ViewerControls.tsx.
 * Handles URL sharing, embed codes, and social media sharing.
 */

import { useState, useCallback, memo } from 'react';
import { useReconstructionStore, useCameraStore, useExportStore, useNotificationStore } from '../../../store';
import { controlPanelStyles } from '../../../theme';
import { ShareIcon, CheckIcon } from '../../../icons';
import { ControlButton, ToggleRow, type PanelType } from '../ControlComponents';
import { generateShareableUrl, generateEmbedUrl, generateIframeHtml, copyWithFeedback } from '../../../hooks/useUrlState';

const styles = controlPanelStyles;

export interface SharePanelProps {
  activePanel: PanelType;
  setActivePanel: (panel: PanelType) => void;
}

export const SharePanel = memo(function SharePanel({
  activePanel,
  setActivePanel,
}: SharePanelProps) {
  const [copiedShareLink, setCopiedShareLink] = useState(false);
  const [copiedEmbedUrl, setCopiedEmbedUrl] = useState(false);
  const [copiedEmbedHtml, setCopiedEmbedHtml] = useState(false);
  const [includeShareLink, setIncludeShareLink] = useState(true);
  const [includeScreenshot, setIncludeScreenshot] = useState(true);

  // Store values
  const reconstruction = useReconstructionStore((s) => s.reconstruction);
  const sourceType = useReconstructionStore((s) => s.sourceType);
  const sourceUrl = useReconstructionStore((s) => s.sourceUrl);
  const sourceManifest = useReconstructionStore((s) => s.sourceManifest);
  const currentViewState = useCameraStore((s) => s.currentViewState);
  const getScreenshotBlob = useExportStore((s) => s.getScreenshotBlob);

  // Check if share buttons should be shown (loaded from URL or manifest)
  const canShare = (sourceType === 'url' || sourceType === 'manifest') && reconstruction;
  const shareSource = sourceUrl ?? sourceManifest;

  // Handle share link copy
  const handleCopyShareLink = useCallback(async () => {
    if (!shareSource) return;
    const url = generateShareableUrl(shareSource, currentViewState);
    await copyWithFeedback(url, setCopiedShareLink);
  }, [shareSource, currentViewState]);

  // Handle embed URL copy
  const handleCopyEmbedUrl = useCallback(async () => {
    if (!shareSource) return;
    const embedUrl = generateEmbedUrl(shareSource, currentViewState);
    await copyWithFeedback(embedUrl, setCopiedEmbedUrl);
  }, [shareSource, currentViewState]);

  // Handle embed HTML copy
  const handleCopyEmbedHtml = useCallback(async () => {
    if (!shareSource) return;
    const embedUrl = generateEmbedUrl(shareSource, currentViewState);
    const iframeHtml = generateIframeHtml(embedUrl);
    await copyWithFeedback(iframeHtml, setCopiedEmbedHtml);
  }, [shareSource, currentViewState]);

  // Get reconstruction stats for social sharing
  const getShareText = useCallback((withShareLink: boolean) => {
    const parts: string[] = [];

    // Add stats if reconstruction is loaded
    if (reconstruction) {
      const numPoints = reconstruction.globalStats?.totalPoints ?? 0;
      const numImages = reconstruction.images.size;
      const numCameras = reconstruction.cameras.size;

      // Format numbers with K/M suffixes
      const formatNum = (n: number) => {
        if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
        if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
        return n.toString();
      };

      if (numPoints > 0) {
        parts.push(`📍 ${formatNum(numPoints)} points`);
      }
      if (numImages > 0) {
        parts.push(`🖼️ ${numImages} images`);
      }
      if (numCameras > 1) {
        parts.push(`📷 ${numCameras} cameras`);
      }
    }

    // Add hashtags and attribution
    // If share link is included separately, don't duplicate the URL in text
    const hashtags = '#3DReconstruction #Photogrammetry #COLMAP';
    const attribution = withShareLink
      ? 'Made with ColmapView by @opsiclear'
      : 'Made with https://colmapview.github.io/ by @opsiclear';

    const placeholder = '[type something here ...]';
    if (parts.length > 0) {
      return `${placeholder}\n\n${parts.join(' | ')}\n\n${hashtags}\n${attribution}`;
    }
    return `${placeholder}\n\n${hashtags}\n${attribution}`;
  }, [reconstruction]);

  // Copy screenshot to clipboard
  const copyScreenshotToClipboard = useCallback(async () => {
    if (!getScreenshotBlob) return false;
    try {
      const blob = await getScreenshotBlob();
      if (blob) {
        await navigator.clipboard.write([
          new ClipboardItem({ 'image/png': blob })
        ]);
        useNotificationStore.getState().addNotification(
          'info',
          'Screenshot copied! Press Ctrl+V to paste',
          4000
        );
        return true;
      }
    } catch (err) {
      console.error('Failed to copy screenshot to clipboard:', err);
    }
    return false;
  }, [getScreenshotBlob]);

  // Handle share to X (Twitter)
  const handleShareToX = useCallback(async () => {
    const url = shareSource ? generateShareableUrl(shareSource, currentViewState) : null;
    const willIncludeLink = includeShareLink && !!url;
    const text = getShareText(willIncludeLink);

    // Copy screenshot to clipboard for easy pasting (if enabled)
    if (includeScreenshot) {
      await copyScreenshotToClipboard();
    }

    // Open X share dialog
    const xUrl = willIncludeLink
      ? `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`
      : `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
    window.open(xUrl, '_blank', 'width=700,height=600');
  }, [shareSource, currentViewState, getShareText, copyScreenshotToClipboard, includeShareLink, includeScreenshot]);

  // Handle share to LinkedIn
  const handleShareToLinkedIn = useCallback(async () => {
    const url = shareSource ? generateShareableUrl(shareSource, currentViewState) : null;
    const willIncludeLink = includeShareLink && !!url;
    const text = getShareText(willIncludeLink);

    // Copy text to clipboard (LinkedIn doesn't support pre-filled text)
    try {
      const shareContent = willIncludeLink ? `${text}\n${url}` : text;
      await navigator.clipboard.writeText(shareContent);
      useNotificationStore.getState().addNotification('info', 'Message copied! Paste in LinkedIn post', 4000);
    } catch {
      // Fallback - just notify
    }

    // Copy screenshot to clipboard for easy pasting (if enabled)
    if (includeScreenshot) {
      await copyScreenshotToClipboard();
    }

    // Open LinkedIn - go to feed to create new post
    window.open('https://www.linkedin.com/feed/', '_blank', 'width=700,height=600');
  }, [shareSource, currentViewState, getShareText, copyScreenshotToClipboard, includeShareLink, includeScreenshot]);

  return (
    <ControlButton
      panelId="share"
      activePanel={activePanel}
      setActivePanel={setActivePanel}
      icon={<ShareIcon className="w-6 h-6" />}
      tooltip="Share"
      panelTitle="Share"
    >
      <div className={styles.panelContent}>
        {canShare && (
          <>
            <div className="text-ds-primary text-sm mb-1">Links:</div>
            <div className="flex flex-col gap-2">
              <button
                onClick={handleCopyShareLink}
                className={copiedShareLink ? styles.actionButtonPrimary : styles.actionButton}
              >
                {copiedShareLink ? (
                  <><CheckIcon className="w-4 h-4 inline mr-1" />Copied!</>
                ) : (
                  'Copy Link'
                )}
              </button>
              <button
                onClick={handleCopyEmbedUrl}
                className={copiedEmbedUrl ? styles.actionButtonPrimary : styles.actionButton}
              >
                {copiedEmbedUrl ? (
                  <><CheckIcon className="w-4 h-4 inline mr-1" />Copied!</>
                ) : (
                  'Embed URL'
                )}
              </button>
              <button
                onClick={handleCopyEmbedHtml}
                className={copiedEmbedHtml ? styles.actionButtonPrimary : styles.actionButton}
              >
                {copiedEmbedHtml ? (
                  <><CheckIcon className="w-4 h-4 inline mr-1" />Copied!</>
                ) : (
                  'Embed HTML'
                )}
              </button>
            </div>
          </>
        )}
        <div className={`text-ds-primary text-sm mb-1 ${canShare ? 'mt-3' : ''}`}>Social Media:</div>
        {canShare && <ToggleRow label="Include Link" checked={includeShareLink} onChange={setIncludeShareLink} />}
        <ToggleRow label="Screen to Clipboard" checked={includeScreenshot} onChange={setIncludeScreenshot} />
          <div className="flex gap-2 mt-2">
            <button
              onClick={handleShareToX}
              className={styles.actionButton}
              style={{ flex: 1, padding: '8px' }}
              data-tooltip="Share to X"
              data-tooltip-pos="bottom"
            >
              <svg viewBox="0 0 24 24" className="w-5 h-5 mx-auto" fill="currentColor">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
              </svg>
            </button>
            <button
              onClick={handleShareToLinkedIn}
              className={styles.actionButton}
              style={{ flex: 1, padding: '8px' }}
              data-tooltip="Share to LinkedIn"
              data-tooltip-pos="bottom"
            >
              <svg viewBox="0 0 24 24" className="w-5 h-5 mx-auto" fill="currentColor">
                <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
              </svg>
            </button>
          </div>
        </div>
    </ControlButton>
  );
});
