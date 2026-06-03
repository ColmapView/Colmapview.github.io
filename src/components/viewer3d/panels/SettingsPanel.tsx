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
  shouldShowAutoHideEditorButton,
} from './settingsPanelViewModel';
import { useSettingsPanelStoreFacade } from './useSettingsPanelStoreFacade';

const styles = controlPanelStyles;

export interface SettingsPanelProps {
  activePanel: PanelType;
  setActivePanel: (panel: PanelType) => void;
}

export function SettingsPanel({ activePanel, setActivePanel }: SettingsPanelProps) {
  const {
    ui: {
      openContextMenuEditor,
      idleHideTimeout,
      setIdleHideTimeout,
      setShowAutoHideEditor,
    },
  } = useSettingsPanelStoreFacade();

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
        {shouldShowAutoHideEditorButton(idleHideTimeout) && (
          <div className={styles.actionGroup}>
            <button
              onClick={() => {
                setShowAutoHideEditor(true);
                setActivePanel(null);
              }}
              className={styles.actionButton}
            >
              Auto-hide 3D Elements
            </button>
          </div>
        )}
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
