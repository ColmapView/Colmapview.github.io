/**
 * Share panel extracted from ViewerControls.tsx.
 * Shares links and opens dataset publishing destinations.
 */

import { useState, useCallback, useMemo, useRef, lazy, Suspense, memo } from 'react';
import { controlPanelStyles } from '../../../theme';
import { ShareIcon, CheckIcon, BucketIcon, GoogleDriveIcon } from '../../../icons';
import { ControlButton, ToggleRow, type PanelType } from '../ControlComponents';
import { generateShareableUrl, generateEmbedUrl, generateIframeHtml, copyWithFeedback } from '../../../hooks/useUrlState';
import {
  buildLinkedInShareContent,
  buildSocialSharePayload,
  buildXShareUrl,
  canShareReconstruction,
  getShareSource,
} from './sharePanelViewModel';
import { useSharePanelStoreFacade } from './useSharePanelStoreFacade';
import { useBucketStorageButtonStoreFacade } from '../../bucket/useBucketStorageButtonStoreFacade';
import { getHfAccountConfiguration, getHfConfiguration } from '../../../features/huggingface/config';
import { getGoogleDriveClientId } from '../../../features/googleDrive/auth';
import { GOOGLE_DRIVE_ENABLED_ORIGIN, GOOGLE_DRIVE_HANDOFF_TOOLTIP, isGoogleDriveEnabled } from '../../../features/googleDrive/config';
import { getGoogleDriveHandoffUrl } from '../googleDriveHandoff';
import { HuggingFaceAccountDialog } from '../HuggingFaceAccountDialog';
import { LazyToolModal } from '../LazyToolModal';

const actionButton = controlPanelStyles.actionButton;
const copiedButton = controlPanelStyles.actionButtonPrimary;
const loadHfPublisher = () => import('../../modals/PublishDatasetModal').then(module => ({ default: module.PublishDatasetModal }));
const loadDrivePublisher = () => import('../../modals/GoogleDrivePublishModal').then(module => ({ default: module.GoogleDrivePublishModal }));
const BucketStorageModal = lazy(() => import('../../bucket/BucketStorageModal').then(module => ({ default: module.BucketStorageModal })));
type Destination = 'bucket' | 'hf' | 'drive' | null;

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
  const [destination, setDestination] = useState<Destination>(null);
  const shareButtonRef = useRef<HTMLButtonElement>(null);
  const { loadUrl } = useBucketStorageButtonStoreFacade();
  const hfPublishing = getHfConfiguration().status !== 'disabled';
  const hfAccount = getHfAccountConfiguration();
  const driveEnabled = isGoogleDriveEnabled();
  const {
    data: {
      hasEdits,
      publicationActive,
      reconstruction,
      sourceUrl,
      sourceManifest,
      currentViewState,
    },
    addNotification,
  } = useSharePanelStoreFacade();

  // Share is possible whenever we have a URL-addressable source (url, manifest,
  // or zip-from-URL). Local drops (including local zips) leave both sourceUrl
  // and sourceManifest null, which hides the source-link actions.
  const shareSource = getShareSource(sourceUrl, sourceManifest);
  const handoffUrl = useMemo(() => driveEnabled ? null : getGoogleDriveHandoffUrl(GOOGLE_DRIVE_ENABLED_ORIGIN, shareSource), [driveEnabled, shareSource]);
  const canShare = canShareReconstruction(shareSource, reconstruction);
  const sourceViewState = hasEdits ? null : currentViewState;
  const sourceConfig = hasEdits ? null : undefined;
  const openDestination = (next: Destination) => {
    // The popup's row unmounts on open; keep a stable opener for dialog focus restoration.
    shareButtonRef.current?.focus({ preventScroll: true });
    setActivePanel(null);
    setDestination(next);
  };
  const closeDestination = () => setDestination(null);

  // Handle share link copy
  const handleCopyShareLink = useCallback(async () => {
    if (!shareSource) return;
    const url = generateShareableUrl(shareSource, sourceViewState, sourceConfig);
    await copyWithFeedback(url, setCopiedShareLink);
  }, [shareSource, sourceViewState, sourceConfig]);

  // Handle embed URL copy
  const handleCopyEmbedUrl = useCallback(async () => {
    if (!shareSource) return;
    const embedUrl = generateEmbedUrl(shareSource, sourceViewState, sourceConfig);
    await copyWithFeedback(embedUrl, setCopiedEmbedUrl);
  }, [shareSource, sourceViewState, sourceConfig]);

  // Handle embed HTML copy
  const handleCopyEmbedHtml = useCallback(async () => {
    if (!shareSource) return;
    const embedUrl = generateEmbedUrl(shareSource, sourceViewState, sourceConfig);
    const iframeHtml = generateIframeHtml(embedUrl);
    await copyWithFeedback(iframeHtml, setCopiedEmbedHtml);
  }, [shareSource, sourceViewState, sourceConfig]);

  // Handle share to X (Twitter)
  const handleShareToX = useCallback(() => {
    const sharePayload = buildSocialSharePayload({
      currentViewState: sourceViewState,
      generateShareableUrl: (source, view) => generateShareableUrl(source, view, sourceConfig),
      includeShareLink,
      reconstruction,
      shareSource,
    });

    // Open X share dialog
    window.open(buildXShareUrl(sharePayload), '_blank', 'width=700,height=600,noopener,noreferrer');
  }, [shareSource, sourceViewState, sourceConfig, reconstruction, includeShareLink]);

  // Handle share to LinkedIn
  const handleShareToLinkedIn = useCallback(async () => {
    const sharePayload = buildSocialSharePayload({
      currentViewState: sourceViewState,
      generateShareableUrl: (source, view) => generateShareableUrl(source, view, sourceConfig),
      includeShareLink,
      reconstruction,
      shareSource,
    });
    const shareContent = buildLinkedInShareContent(sharePayload);

    // Open during the click so clipboard permissions cannot block the popup.
    window.open('https://www.linkedin.com/feed/', '_blank', 'width=700,height=600,noopener,noreferrer');
    try {
      await navigator.clipboard.writeText(shareContent);
      addNotification('info', 'Message copied! Paste in LinkedIn post', 4000);
    } catch {
      // LinkedIn remains open when clipboard access is unavailable.
    }
  }, [shareSource, sourceViewState, sourceConfig, reconstruction, includeShareLink, addNotification]);

  return <>
    <ControlButton
      panelId="share"
      activePanel={destination ? null : activePanel}
      setActivePanel={setActivePanel}
      buttonRef={shareButtonRef}
      icon={<ShareIcon className="w-6 h-6" />}
      tooltip="Share"
      panelTitle="Share"
      isActive={Boolean(destination) || publicationActive}
      onClick={() => setActivePanel('share')}
    >
      <div className="flex flex-col gap-3 text-sm">
        {canShare && (
          <div className="flex flex-col gap-2">
            {hasEdits && <p className="m-0 text-ds-secondary">This link opens the original dataset. Upload to share edits.</p>}
            <button
              type="button"
              onClick={handleCopyShareLink}
              className={`${copiedShareLink ? copiedButton : actionButton} w-full`}
            >
              {copiedShareLink ? (
                <><CheckIcon className="w-4 h-4 inline mr-1" />Copied!</>
              ) : (
                hasEdits ? 'Copy original dataset link' : 'Copy link'
              )}
            </button>
            <button
              type="button"
              onClick={handleCopyEmbedUrl}
              className={`${copiedEmbedUrl ? copiedButton : actionButton} w-full`}
            >
              {copiedEmbedUrl ? (
                <><CheckIcon className="w-4 h-4 inline mr-1" />Copied!</>
              ) : (
                'Embed URL'
              )}
            </button>
            <button
              type="button"
              onClick={handleCopyEmbedHtml}
              className={`${copiedEmbedHtml ? copiedButton : actionButton} w-full`}
            >
              {copiedEmbedHtml ? (
                <><CheckIcon className="w-4 h-4 inline mr-1" />Copied!</>
              ) : (
                'Embed HTML'
              )}
            </button>
          </div>
        )}
        <div className="flex flex-col gap-2">
          <h3 className={`${controlPanelStyles.panelSectionLabel} m-0 font-normal`}>Storage</h3>
          <button type="button" className={`${actionButton} w-full`} aria-label="Bucket storage" onClick={() => openDestination('bucket')}>
            <BucketIcon className="w-4 h-4" />Bucket
          </button>
          {(hfPublishing || hfAccount.status === 'ready') && <button type="button" className={`${actionButton} w-full`}
            aria-label={hfPublishing ? 'Publish to Hugging Face' : 'Hugging Face account'} onClick={() => openDestination('hf')}>
            <span aria-hidden="true">🤗</span>Hugging Face
          </button>}
          {driveEnabled ? getGoogleDriveClientId() && <button type="button" className={`${actionButton} w-full`}
            aria-label="Publish to Google Drive" onClick={() => openDestination('drive')}>
            <GoogleDriveIcon className="w-4 h-4" />Google Drive
          </button> : <a href={handoffUrl!} target="_blank" rel="noopener noreferrer" aria-label="Use Google Drive"
            className={`${actionButton} w-full no-underline`} data-tooltip={shareSource ? `${GOOGLE_DRIVE_HANDOFF_TOOLTIP}\nThis dataset will reopen there.` : GOOGLE_DRIVE_HANDOFF_TOOLTIP}>
            <GoogleDriveIcon className="w-4 h-4" />Google Drive ↗
          </a>}
        </div>
        <div className="flex flex-col gap-2">
          <div className="flex flex-col gap-2">
            <h3 className={`${controlPanelStyles.panelSectionLabel} m-0 font-normal`}>Social media</h3>
            <button type="button" onClick={handleShareToX} aria-label="Share to X" className={`${actionButton} w-full`}>
              <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor" aria-hidden="true">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
              </svg>X
            </button>
            <button type="button" onClick={handleShareToLinkedIn} aria-label="Share to LinkedIn" className={`${actionButton} w-full`}>
              <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor" aria-hidden="true">
                <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
              </svg>LinkedIn
            </button>
          </div>
          {canShare && <ToggleRow label="Include link" checked={includeShareLink} onChange={setIncludeShareLink} />}
        </div>
      </div>
    </ControlButton>
    {destination === 'bucket' && <Suspense fallback={<span role="status">Opening bucket storage…</span>}>
      <BucketStorageModal isOpen onClose={closeDestination} onLoadUrl={loadUrl} />
    </Suspense>}
    {hfPublishing ? <LazyToolModal modal title="Publish dataset" load={loadHfPublisher} isOpen={destination === 'hf'} onClose={closeDestination} />
      : hfAccount.status === 'ready' && <HuggingFaceAccountDialog config={hfAccount.config} isOpen={destination === 'hf'} onClose={closeDestination} />}
    {driveEnabled && getGoogleDriveClientId() && <LazyToolModal modal title="Publish to Google Drive" load={loadDrivePublisher} isOpen={destination === 'drive'} onClose={closeDestination} />}
  </>;
});
