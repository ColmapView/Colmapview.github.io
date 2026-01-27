/**
 * Export panel extracted from ViewerControls.tsx.
 * Handles exporting reconstruction data in various formats.
 */

import { memo } from 'react';
import {
  useReconstructionStore,
  useTransformStore,
  applyTransformToData,
} from '../../../store';
import { controlPanelStyles } from '../../../theme';
import { ExportIcon } from '../../../icons';
import { ControlButton, type PanelType } from '../ControlComponents';
import { exportReconstructionText, exportReconstructionBinary, exportPointsPLY, downloadReconstructionZip } from '../../../parsers';
import { extractConfigurationFromStores, serializeConfigToYaml } from '../../../config/configuration';
import { isIdentityEuler } from '../../../utils/sim3dTransforms';

const styles = controlPanelStyles;

export interface ExportPanelProps {
  activePanel: PanelType;
  setActivePanel: (panel: PanelType) => void;
}

export const ExportPanel = memo(function ExportPanel({
  activePanel,
  setActivePanel,
}: ExportPanelProps) {
  // Store values
  const reconstruction = useReconstructionStore((s) => s.reconstruction);
  const wasmReconstruction = useReconstructionStore((s) => s.wasmReconstruction);
  const loadedFiles = useReconstructionStore((s) => s.loadedFiles);

  // Transform state
  const transform = useTransformStore((s) => s.transform);
  const hasTransformChanges = !isIdentityEuler(transform);

  // Export config YAML
  const handleExportConfig = () => {
    const config = extractConfigurationFromStores();
    const yaml = serializeConfigToYaml(config);
    const blob = new Blob([yaml], { type: 'text/yaml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'colmapview-config.yml';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Export ZIP archive
  const handleExportZip = async () => {
    if (!reconstruction) return;
    try {
      await downloadReconstructionZip(
        reconstruction,
        { format: 'binary' },
        loadedFiles?.imageFiles,
        wasmReconstruction
      );
    } catch (err) {
      console.error('ZIP export failed:', err);
    }
  };

  // Default export action (binary)
  const handleDefaultExport = () => {
    if (reconstruction) {
      exportReconstructionBinary(reconstruction, wasmReconstruction);
    }
  };

  return (
    <ControlButton
      panelId="export"
      activePanel={activePanel}
      setActivePanel={setActivePanel}
      icon={<ExportIcon className="w-6 h-6" />}
      tooltip="Export"
      onClick={handleDefaultExport}
      panelTitle="Export"
      disabled={!reconstruction}
    >
      <div className={styles.panelContent}>
        <div className="flex flex-col gap-2">
          <button
            onClick={() => { if (reconstruction) exportReconstructionBinary(reconstruction, wasmReconstruction); }}
            disabled={!reconstruction}
            className={reconstruction ? styles.actionButton : styles.actionButtonDisabled}
          >
            Binary (.bin)
          </button>
          <button
            onClick={() => { if (reconstruction) exportReconstructionText(reconstruction, wasmReconstruction); }}
            disabled={!reconstruction}
            className={reconstruction ? styles.actionButton : styles.actionButtonDisabled}
          >
            Text (.txt)
          </button>
          <button
            onClick={() => { if (reconstruction) exportPointsPLY(reconstruction, wasmReconstruction); }}
            disabled={!reconstruction}
            className={reconstruction ? styles.actionButton : styles.actionButtonDisabled}
          >
            Points (.ply)
          </button>
          <button
            onClick={handleExportConfig}
            className={styles.actionButton}
          >
            Config (.yml)
          </button>
          <button
            onClick={handleExportZip}
            disabled={!reconstruction}
            className={reconstruction ? styles.actionButton : styles.actionButtonDisabled}
          >
            ZIP (.zip)
          </button>
        </div>
        <div className="flex justify-center mt-2">
          <button
            onClick={applyTransformToData}
            disabled={!hasTransformChanges}
            className={hasTransformChanges ? styles.actionButtonPrimary : styles.actionButtonPrimaryDisabled}
          >
            Apply Transform
          </button>
        </div>
      </div>
    </ControlButton>
  );
});
