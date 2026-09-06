import { useMemo } from 'react';
import { statusBarStyles } from '../../theme';
import { StatWithHistogram } from './StatWithHistogram';
import { CacheStatsIndicator } from './CacheStatsIndicator';
import {
  STATUS_BAR_SHORTCUTS_BUTTON_CLASS,
  STATUS_BAR_SHORTCUTS_LABEL,
  STATUS_BAR_SHORTCUTS_TITLE,
  formatStatusBarFps,
  getDesktopEmptyStatusText,
  getStatusBarContainerClassName,
  shouldShowStatusHistograms,
} from './statusBarViewModel';
import { getAutoHiddenChromeProps, shouldHideChromeWithButtons } from './autoHideChromePolicy';
import { useStatusBarStoreFacade } from './useStatusBarStoreFacade';
import {
  computeMeanPsnrFromMetrics,
  computeMeanSsimFromMetrics,
  formatMeanPsnrValue,
  formatMeanSsimValue,
} from './statHistogramViewModel';

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
    setShowHotkeyHelp,
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
        <span className="text-ds-secondary">{formatStatusBarFps(fps)}</span>
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
        <button
          type="button"
          onClick={() => setShowHotkeyHelp(true)}
          className={STATUS_BAR_SHORTCUTS_BUTTON_CLASS}
          title={STATUS_BAR_SHORTCUTS_TITLE}
          {...getAutoHiddenChromeProps(hideWithButtons)}
        >
          {STATUS_BAR_SHORTCUTS_LABEL}
        </button>
        <button
          type="button"
          onClick={() => setShowHotkeyHelp(true, 'about')}
          className={STATUS_BAR_SHORTCUTS_BUTTON_CLASS}
          aria-label={`About ColmapView, version ${__APP_VERSION__}`}
          data-tooltip="About ColmapView"
          {...getAutoHiddenChromeProps(hideWithButtons)}
        >
          v{__APP_VERSION__}
        </button>
      </div>
    </footer>
  );
}
