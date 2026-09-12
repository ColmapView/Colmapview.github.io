import {
  AlignPanel,
  AxesGridPanel,
  BackgroundPanel,
  CameraDisplayPanel,
  CameraModePanel,
  ExportPanel,
  GalleryToggleButton,
  MatchesPanel,
  PointCloudPanel,
  RigPanel,
  ScreenshotPanel,
  SelectionHighlightPanel,
  SettingsPanel,
  SharePanel,
  TransformPanel,
  ViewPanel,
} from './panels';
import type { ViewerControlsController } from './useViewerControlsController';
import { TrainingToggleButton } from '../training/TrainingToggleButton';
import {
  TOOLBAR_GROUP_CLASS,
  TOOLBAR_GROUP_LABELS,
  shouldShowCameraDependentPanels,
  shouldShowMatchesPanel,
} from './viewerControlsLayoutPolicy';

export interface ViewerControlsToolbarProps {
  controller: ViewerControlsController;
}

/**
 * Hairline separator between toolbar clusters (view / data / capture / app).
 * The VISUAL half of the grouping only — the semantic half is the `role="group"`
 * wrapper around each cluster below, so this stays out of the accessibility tree
 * and the dividers stay direct children of the flex column (between the groups,
 * never inside one). Each divider assumes the cluster that follows it is
 * non-empty; that holds today because every cluster has an unconditional core
 * (the Data cluster's point-cloud and camera-display panels always render, only
 * its match/highlight extras are conditional).
 */
function ToolbarDivider() {
  return <div aria-hidden="true" className="w-6 h-px bg-ds-muted/30 mx-auto" />;
}

export function ViewerControlsToolbar({ controller }: ViewerControlsToolbarProps) {
  const {
    className,
    viewPanel,
    axesGridPanel,
    cameraModePanel,
    backgroundPanel,
    transformPanel,
    alignPanel,
    pointCloudPanel,
    cameraDisplayPanel,
    matchesPanel,
    selectionHighlightPanel,
    rigPanel,
    screenshotPanel,
    sharePanel,
    exportPanel,
    settingsPanel,
    galleryToggleButton,
  } = controller;

  return (
    <div className={className} data-testid="viewer-controls">
      <div role="group" aria-label={TOOLBAR_GROUP_LABELS.view} className={TOOLBAR_GROUP_CLASS}>
        <ViewPanel {...viewPanel} />
        <AxesGridPanel {...axesGridPanel} />
        <CameraModePanel {...cameraModePanel} />
        <BackgroundPanel {...backgroundPanel} />
        <TransformPanel {...transformPanel} />
        <AlignPanel {...alignPanel} />
      </div>

      <ToolbarDivider />

      <div role="group" aria-label={TOOLBAR_GROUP_LABELS.data} className={TOOLBAR_GROUP_CLASS}>
        <PointCloudPanel {...pointCloudPanel} />
        <CameraDisplayPanel {...cameraDisplayPanel} />

        {shouldShowCameraDependentPanels(cameraDisplayPanel.showCameras) && (
          <>
            {shouldShowMatchesPanel(cameraDisplayPanel.showCameras, cameraDisplayPanel.cameraDisplayMode, cameraDisplayPanel.hasPinholeCameras) && (
              <MatchesPanel {...matchesPanel} />
            )}

            <SelectionHighlightPanel {...selectionHighlightPanel} />
          </>
        )}

        <RigPanel {...rigPanel} />
      </div>

      <ToolbarDivider />

      <div role="group" aria-label={TOOLBAR_GROUP_LABELS.capture} className={TOOLBAR_GROUP_CLASS}>
        <ScreenshotPanel {...screenshotPanel} />
        <SharePanel {...sharePanel} />
        <ExportPanel {...exportPanel} />
      </div>

      <ToolbarDivider />

      <div role="group" aria-label={TOOLBAR_GROUP_LABELS.app} className={TOOLBAR_GROUP_CLASS}>
        <SettingsPanel {...settingsPanel} />
        <TrainingToggleButton activePanel={settingsPanel.activePanel} setActivePanel={settingsPanel.setActivePanel} />
        <GalleryToggleButton {...galleryToggleButton} />
      </div>
    </div>
  );
}
