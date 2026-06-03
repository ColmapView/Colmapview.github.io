import { memo } from 'react';
import type { CameraProjection } from '../../../store/types';
import type { ViewDirection } from '../../../store';
import { ViewIcon } from '../../../icons';
import { controlPanelStyles } from '../../../theme';
import {
  ControlButton,
  SliderRow,
  type PanelType,
} from '../ControlComponents';
import {
  VIEW_DIRECTION_BUTTON_ROWS,
  VIEW_PROJECTION_OPTIONS,
  formatCameraFovValue,
  shouldShowCameraFovSlider,
} from './viewPanelViewModel';

const styles = controlPanelStyles;

export interface ViewPanelProps {
  activePanel: PanelType;
  setActivePanel: (panel: PanelType) => void;
  cameraProjection: CameraProjection;
  setCameraProjection: (projection: CameraProjection) => void;
  cameraFov: number;
  setCameraFov: (fov: number) => void;
  setView: (direction: ViewDirection) => void;
  onResetView: () => void;
}

export const ViewPanel = memo(function ViewPanel({
  activePanel,
  setActivePanel,
  cameraProjection,
  setCameraProjection,
  cameraFov,
  setCameraFov,
  setView,
  onResetView,
}: ViewPanelProps) {
  return (
    <ControlButton
      panelId="view"
      activePanel={activePanel}
      setActivePanel={setActivePanel}
      icon={<ViewIcon className="w-6 h-6" />}
      tooltip="View options (R)"
      onClick={onResetView}
      panelTitle="View"
    >
      <div className={styles.panelContent}>
        <div className="flex gap-1 mb-3">
          {VIEW_PROJECTION_OPTIONS.map((option) => (
            <button
              key={option.value}
              onClick={() => setCameraProjection(option.value)}
              className={`${cameraProjection === option.value ? styles.actionButtonPrimary : styles.actionButton} flex-1`}
            >
              {option.label}
            </button>
          ))}
        </div>

        {shouldShowCameraFovSlider(cameraProjection) && (
          <SliderRow
            label="FOV"
            value={cameraFov}
            min={10}
            max={120}
            step={0.1}
            onChange={setCameraFov}
            formatValue={formatCameraFovValue}
          />
        )}

        {VIEW_DIRECTION_BUTTON_ROWS.map((row, rowIndex) => (
          <div
            key={row.map((button) => button.direction).join('-')}
            className={rowIndex === VIEW_DIRECTION_BUTTON_ROWS.length - 1 ? 'flex gap-1 mb-3' : 'flex gap-1 mb-1'}
          >
            {row.map((button) => (
              <button
                key={button.direction}
                onClick={() => setView(button.direction)}
                className={`${styles.actionButton} flex-1`}
              >
                {button.label} <span className="text-ds-muted text-xs">({button.hotkey})</span>
              </button>
            ))}
          </div>
        ))}
        <div className={styles.actionGroup}>
          <button onClick={onResetView} className={`${styles.actionButtonPrimary} flex-1`}>
            Reset View
            <span className="text-ds-void/70 ml-2 text-xs">(R)</span>
          </button>
        </div>
      </div>
    </ControlButton>
  );
});
