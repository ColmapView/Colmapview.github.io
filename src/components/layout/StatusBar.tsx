import { Fragment } from 'react';
import { statusBarStyles } from '../../theme';
import { StatWithHistogram } from './StatWithHistogram';
import { CacheStatsIndicator } from './CacheStatsIndicator';
import {
  STATUS_BAR_COLMAP_LINK,
  STATUS_BAR_LINK_CLASS_NAME,
  STATUS_BAR_PROJECT_LINKS,
  formatStatusBarFps,
  getDesktopEmptyStatusText,
  getStatusBarLinkHoverColor,
  getStatusBarLinkRestColor,
  getStatusBarLinkStyle,
  shouldShowStatusHistograms,
  type StatusBarLink,
} from './statusBarViewModel';
import { useStatusBarStoreFacade } from './useStatusBarStoreFacade';

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
    fps,
  } = useStatusBarStoreFacade();

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

  return (
    <footer className={statusBarStyles.container}>
      <div className={statusBarStyles.group}>
        <span className="text-ds-tertiary">{formatStatusBarFps(fps)}</span>
        <CacheStatsIndicator />
        {showHistograms && reconstruction && globalStats && (
          <>
            <StatWithHistogram
              label="Avg Track"
              value={globalStats.avgTrackLength.toFixed(2)}
              type="trackLength"
              points3D={reconstruction.points3D}
              wasmReconstruction={wasmReconstruction}
            />
            <StatWithHistogram
              label="Avg Reproj Error"
              value={`${globalStats.avgError.toFixed(3)}px`}
              type="error"
              points3D={reconstruction.points3D}
              wasmReconstruction={wasmReconstruction}
            />
          </>
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
