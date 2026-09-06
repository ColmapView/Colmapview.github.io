import { ThemeSelect } from '../../ui/ThemeSelect';
import { useCallback } from 'react';
import { extractConfigurationFromStores, serializeConfigToYaml } from '../../../config/configuration';
import { clearPersistedSettings } from '../../../store/migration';
import { SettingsIcon } from '../../../icons';
import { controlPanelStyles } from '../../../theme';
import { requestConfirmation } from '../../../utils/confirmation';
import { downloadBlob } from '../../../utils/download';
import { ProfileSelector } from '../../dropzone/ProfileSelector';
import {
  ControlButton,
  SliderRow,
  type PanelType,
} from '../ControlComponents';
import { buildExampleManifestJson } from '../viewerControlsViewModel';
import {
  CLEAR_SETTINGS_CONFIRMATION,
  EXAMPLE_MANIFEST_DESCRIPTION,
  SETTINGS_CONFIG_DOWNLOAD,
  SETTINGS_EXAMPLE_MANIFEST_DOWNLOAD,
  SETTINGS_PANEL_SECTION_LABELS,
  formatIdleHideTimeoutValue,
  getSettingsToolRows,
  type SettingsToolId,
} from './settingsPanelViewModel';
import { useSettingsPanelStoreFacade } from './useSettingsPanelStoreFacade';

const styles = controlPanelStyles;

export interface SettingsPanelProps {
  activePanel: PanelType;
  setActivePanel: (panel: PanelType) => void;
}

export function SettingsPanel({ activePanel, setActivePanel }: SettingsPanelProps) {
  const {
    data: {
      reconstruction,
      wasmReconstruction,
    },
    ui: {
      openContextMenuEditor,
      idleHideTimeout,
      setIdleHideTimeout,
      setShowAutoHideEditor,
      setShowDeletionModal,
      setShowConversionModal,
      setShowFloorModal,
    },
  } = useSettingsPanelStoreFacade();

  const toolRows = getSettingsToolRows({
    hasReconstruction: Boolean(reconstruction),
    hasCameras: (reconstruction?.cameras.size ?? 0) > 0,
    hasPoints: wasmReconstruction?.hasPoints() ?? false,
    idleHideTimeout,
  });

  const openTool = useCallback((toolId: SettingsToolId) => {
    switch (toolId) {
      case 'deletion':
        setShowDeletionModal(true);
        break;
      case 'cameraConversion':
        setShowConversionModal(true);
        break;
      case 'floorDetection':
        setShowFloorModal(true);
        break;
      case 'autoHide':
        setShowAutoHideEditor(true);
        break;
    }
    // Tool windows are their own surface: leaving the hover panel open behind
    // them is what every existing tool entry point avoids.
    setActivePanel(null);
  }, [
    setActivePanel,
    setShowAutoHideEditor,
    setShowConversionModal,
    setShowDeletionModal,
    setShowFloorModal,
  ]);

  const handleExportConfig = useCallback(() => {
    const config = extractConfigurationFromStores();
    const yaml = serializeConfigToYaml(config);
    downloadBlob(
      new Blob([yaml], { type: SETTINGS_CONFIG_DOWNLOAD.mimeType }),
      SETTINGS_CONFIG_DOWNLOAD.filename
    );
  }, []);

  const handleClearSettings = useCallback(async () => {
    if (await requestConfirmation(CLEAR_SETTINGS_CONFIRMATION)) {
      clearPersistedSettings();
      window.location.reload();
    }
  }, []);

  const handleDownloadExampleManifest = useCallback(() => {
    downloadBlob(
      new Blob([buildExampleManifestJson()], { type: SETTINGS_EXAMPLE_MANIFEST_DOWNLOAD.mimeType }),
      SETTINGS_EXAMPLE_MANIFEST_DOWNLOAD.filename
    );
  }, []);

  return (
    <ControlButton
      panelId="settings"
      activePanel={activePanel}
      setActivePanel={setActivePanel}
      icon={<SettingsIcon className="w-6 h-6" />}
      tooltip="Settings"
      panelTitle="Settings"
    >
      <div className={styles.panelContent}>
        <ThemeSelect />
        <div className="text-ds-muted text-xs uppercase tracking-wide mb-2">
          {SETTINGS_PANEL_SECTION_LABELS.profiles}
        </div>
        <ProfileSelector />

        <div className="text-ds-muted text-xs uppercase tracking-wide mt-4 mb-2">
          {SETTINGS_PANEL_SECTION_LABELS.configuration}
        </div>
        <div className={styles.actionGroup}>
          <button onClick={handleExportConfig} className={styles.actionButton}>
            Export Config
          </button>
        </div>
        <div className={styles.actionGroup}>
          <button onClick={handleClearSettings} className={styles.actionButton}>
            Clear Settings
          </button>
        </div>

        <div className="text-ds-muted text-xs uppercase tracking-wide mt-4 mb-2">
          {SETTINGS_PANEL_SECTION_LABELS.customization}
        </div>
        <SliderRow
          label="Auto-hide UI"
          value={idleHideTimeout}
          min={0}
          max={10}
          step={1}
          onChange={setIdleHideTimeout}
          formatValue={formatIdleHideTimeoutValue}
        />
        <div className={styles.actionGroup}>
          <button
            onClick={() => {
              openContextMenuEditor();
              setActivePanel(null);
            }}
            className={styles.actionButton}
          >
            Edit Context Menu
          </button>
        </div>

        <div className="text-ds-muted text-xs uppercase tracking-wide mt-4 mb-2">
          {SETTINGS_PANEL_SECTION_LABELS.tools}
        </div>
        <div className="flex flex-col gap-2">
          {toolRows.map((tool) => (
            <button
              key={tool.id}
              onClick={() => openTool(tool.id)}
              disabled={!tool.enabled}
              className={tool.enabled ? styles.actionButton : styles.actionButtonDisabled}
            >
              {tool.label}
            </button>
          ))}
        </div>

        <div className="text-ds-muted text-xs uppercase tracking-wide mt-4 mb-2">
          {SETTINGS_PANEL_SECTION_LABELS.developer}
        </div>
        <div className={styles.actionGroup}>
          <button onClick={handleDownloadExampleManifest} className={styles.actionButton}>
            Example manifest.json
          </button>
        </div>
        <div className="text-ds-secondary text-sm mt-1">
          {EXAMPLE_MANIFEST_DESCRIPTION}
        </div>
      </div>
    </ControlButton>
  );
}
