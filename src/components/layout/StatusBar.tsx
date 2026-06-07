import { Fragment, useMemo } from 'react';
import { statusBarStyles } from '../../theme';
import { StatWithHistogram } from './StatWithHistogram';
import { CacheStatsIndicator } from './CacheStatsIndicator';
import {
  STATUS_BAR_COLMAP_LINK,
  STATUS_BAR_LINK_CLASS_NAME,
  STATUS_BAR_PROJECT_LINKS,
  formatStatusBarFps,
  getDesktopEmptyStatusText,
  getStatusBarContainerClassName,
  getStatusBarLinkHoverColor,
  getStatusBarLinkRestColor,
  getStatusBarLinkStyle,
  shouldShowStatusHistograms,
  type StatusBarLink,
} from './statusBarViewModel';
import { shouldHideChromeWithButtons } from './autoHideChromePolicy';
import { useStatusBarStoreFacade } from './useStatusBarStoreFacade';
import {
  computeMeanPsnrFromMetrics,
  computeMeanSsimFromMetrics,
  formatMeanPsnrValue,
  formatMeanSsimValue,
} from './statHistogramViewModel';

function StatusBarLinkAnchor({ link }: { link: StatusBarLink }) {
  return (
    <a
      href={link.href}
      target="_blank"
      rel="noopener noreferrer"
      className={STATUS_BAR_LINK_CLASS_NAME}
      style={getStatusBarLinkStyle()}
      title={link.title}
      onMouseEnter={(e) => { e.currentTarget.style.color = getStatusBarLinkHoverColor(link); }}
      onMouseLeave={(e) => { e.currentTarget.style.color = getStatusBarLinkRestColor(); }}
    >
      {link.label}
    </a>
  );
}

export function StatusBar() {
  const {
    urlLoading,
    reconstruction,
    wasmReconstruction,
    hasSplatFile,
    splatPsnrFrameReady,
    splatPsnrByImage,
    fps,
    autoHideButtons,
    isIdle,
    showAutoHideEditor,
  } = useStatusBarStoreFacade();
  const hideWithButtons = shouldHideChromeWithButtons({
    autoHideButtons,
    isIdle,
    showAutoHideEditor,
  });

  // Use pre-computed global stats instead of computing on every render
  const globalStats = reconstruction?.globalStats;
  const emptyStatusText = getDesktopEmptyStatusText({
    hasReconstruction: Boolean(reconstruction),
    urlLoading,
  });
  const showHistograms = shouldShowStatusHistograms({
    hasReconstruction: Boolean(reconstruction),
    hasGlobalStats: Boolean(globalStats),
  });
  const meanPsnr = useMemo(
    () => computeMeanPsnrFromMetrics(splatPsnrByImage),
    [splatPsnrByImage]
  );
  const meanSsim = useMemo(
    () => computeMeanSsimFromMetrics(splatPsnrByImage),
    [splatPsnrByImage]
  );
  const showPsnrHistogram = Boolean(
    reconstruction &&
    reconstruction.images.size > 0 &&
    hasSplatFile &&
    splatPsnrFrameReady &&
    splatPsnrByImage.size > 0 &&
    meanPsnr !== null
  );
  const showSsimHistogram = Boolean(
    reconstruction &&
    reconstruction.images.size > 0 &&
    hasSplatFile &&
    splatPsnrFrameReady &&
    splatPsnrByImage.size > 0 &&
    meanSsim !== null
  );

  return (
    <footer
      className={getStatusBarContainerClassName({
        baseClassName: statusBarStyles.container,
        hidden: hideWithButtons,
      })}
      aria-hidden={hideWithButtons}
      data-idle-pause="true"
    >
      <div className={statusBarStyles.group}>
        <span className="text-ds-tertiary">{formatStatusBarFps(fps)}</span>
        <CacheStatsIndicator />
        {showHistograms && reconstruction && globalStats && (
          <>
            <StatWithHistogram
              label="Track"
              value={globalStats.avgTrackLength.toFixed(2)}
              type="trackLength"
              points3D={reconstruction.points3D}
              wasmReconstruction={wasmReconstruction}
            />
            <StatWithHistogram
              label="Reproj Err"
              value={`${globalStats.avgError.toFixed(3)}px`}
              type="error"
              points3D={reconstruction.points3D}
              wasmReconstruction={wasmReconstruction}
            />
          </>
        )}
        {showPsnrHistogram && (
          <StatWithHistogram
            label="PSNR"
            value={formatMeanPsnrValue(meanPsnr)}
            type="psnr"
            psnrMetrics={splatPsnrByImage}
            psnrTotalCount={reconstruction?.images.size ?? 0}
          />
        )}
        {showSsimHistogram && (
          <StatWithHistogram
            label="SSIM"
            value={formatMeanSsimValue(meanSsim)}
            type="ssim"
            psnrMetrics={splatPsnrByImage}
            psnrTotalCount={reconstruction?.images.size ?? 0}
          />
        )}
        {emptyStatusText !== null && <span>{emptyStatusText}</span>}
      </div>
      <div className="flex items-center gap-2 text-ds-secondary">
        <span>ColmapView by OpsiClear</span>
        {STATUS_BAR_PROJECT_LINKS.map((link) => (
          <Fragment key={link.href}>
            <span>|</span>
            <StatusBarLinkAnchor link={link} />
          </Fragment>
        ))}
        <span>|</span>
        <span>AGPL 3.0</span>
        <span>|</span>
        <span>Based on{' '}
          <StatusBarLinkAnchor link={STATUS_BAR_COLMAP_LINK} />
        </span>
        <span>|</span>
        <span>v{__APP_VERSION__}</span>
      </div>
    </footer>
  );
}
