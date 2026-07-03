import {
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
import {
  shouldShowCameraDependentPanels,
  shouldShowMatchesPanel,
} from './viewerControlsLayoutPolicy';

export interface ViewerControlsToolbarProps {
  controller: ViewerControlsController;
}

export function ViewerControlsToolbar({ controller }: ViewerControlsToolbarProps) {
  const {
    className,
    viewPanel,
    axesGridPanel,
    cameraModePanel,
    backgroundPanel,
    transformPanel,
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
      <ViewPanel {...viewPanel} />
      <AxesGridPanel {...axesGridPanel} />
      <CameraModePanel {...cameraModePanel} />
      <BackgroundPanel {...backgroundPanel} />
      <TransformPanel {...transformPanel} />
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
      <ScreenshotPanel {...screenshotPanel} />
      <SharePanel {...sharePanel} />
      <ExportPanel {...exportPanel} />
      <SettingsPanel {...settingsPanel} />
      <GalleryToggleButton {...galleryToggleButton} />
    </div>
  );
}
