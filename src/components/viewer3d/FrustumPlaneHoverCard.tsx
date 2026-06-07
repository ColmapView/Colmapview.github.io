import { ICON_SIZES, hoverCardStyles } from '../../theme';
import {
  formatSplatPsnrMetric,
  formatSplatSsimMetric,
  hasSplatPsnrValue,
  hasSplatSsimValue,
} from './splatPsnrMetric';
import { formatImageId } from './cameraFrustumViewModel';
import { useFrustumHoverCardMetricStoreFacade } from './useFrustumHoverCardStoreFacade';

interface FrustumPlaneHoverCardProps {
  imageName: string;
  imageId: number;
  cameraId: number;
  multiCamera: boolean;
  numPoints3D: number;
  isSelected: boolean;
  isMatched: boolean;
  wouldGoBack: boolean;
  cameraProjection: string;
}

function MouseScrollIcon() {
  return (
    <svg className={ICON_SIZES.hoverCard} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="6" y="2" width="12" height="20" rx="6" />
      <path d="M12 6v4M12 14v4M9 8l3-3 3 3M9 16l3 3 3-3" />
    </svg>
  );
}

function MouseButtonIcon({ side }: { side: 'left' | 'right' }) {
  const x = side === 'left' ? 6 : 12;

  return (
    <svg className={ICON_SIZES.hoverCard} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="6" y="2" width="12" height="20" rx="6" />
      <path d="M12 2v8" />
      <rect x={x} y="2" width="6" height="8" rx="3" fill="currentColor" opacity="0.5" />
    </svg>
  );
}

export function FrustumPlaneHoverCard({
  imageName,
  imageId,
  cameraId,
  multiCamera,
  numPoints3D,
  isSelected,
  isMatched,
  wouldGoBack,
  cameraProjection,
}: FrustumPlaneHoverCardProps) {
  const { splatMetric } = useFrustumHoverCardMetricStoreFacade(imageId);
  const rightAction = isMatched ? 'Right: matches' : wouldGoBack ? 'Right: back' : 'Right: fly to';

  return (
    <div className={hoverCardStyles.container}>
      <div className={hoverCardStyles.title}>{imageName}</div>
      <div className={hoverCardStyles.subtitle}>{formatImageId(imageId, cameraId, multiCamera)}</div>
      <div className={hoverCardStyles.subtitle}>{numPoints3D} points</div>
      {hasSplatPsnrValue(splatMetric?.psnr) && (
        <div className={hoverCardStyles.subtitle}>{formatSplatPsnrMetric(splatMetric.psnr)}</div>
      )}
      {hasSplatSsimValue(splatMetric?.ssim) && (
        <div className={hoverCardStyles.subtitle}>{formatSplatSsimMetric(splatMetric.ssim)}</div>
      )}
      <div className={hoverCardStyles.hint}>
        {isSelected && cameraProjection === 'perspective' && (
          <div className={hoverCardStyles.hintRow}>
            <MouseScrollIcon />
            Scroll: FOV
          </div>
        )}
        <div className={hoverCardStyles.hintRow}>
          <MouseButtonIcon side="left" />
          {isSelected ? 'Left: details' : 'Left: select'}
        </div>
        <div className={hoverCardStyles.hintRow}>
          <MouseButtonIcon side="right" />
          {rightAction}
        </div>
        {isSelected && (
          <div className={hoverCardStyles.hintRow}>(U) undistort</div>
        )}
      </div>
    </div>
  );
}
