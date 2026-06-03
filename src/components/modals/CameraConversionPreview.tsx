import type { ConversionPreview } from '../../utils/cameraModelConversions';
import {
  getCameraConversionCharacterizationClassName,
  getCameraConversionCharacterizationLabel,
  getCameraConversionParameterRowDisplay,
  type CameraConversionParameterRow,
} from './cameraConversionModalViewModel';

interface CameraConversionPreviewProps {
  conversionPreview: ConversionPreview;
  parameterRows: CameraConversionParameterRow[];
}

export function CameraConversionPreview({
  conversionPreview,
  parameterRows,
}: CameraConversionPreviewProps) {
  return (
    <div className="text-xs space-y-2">
      <div className="flex items-center gap-2">
        <span className={getCameraConversionCharacterizationClassName(conversionPreview.characterization)}>
          {getCameraConversionCharacterizationLabel(conversionPreview.characterization)}
        </span>
        <span className="text-ds-muted truncate">{conversionPreview.description}</span>
      </div>

      <div className="font-mono">
        {parameterRows.map((row) => {
          const displayRow = getCameraConversionParameterRowDisplay(row);

          return (
            <div key={displayRow.name} className="flex items-center">
              <span className={displayRow.sourceClassName}>
                {displayRow.sourceValueLabel}
              </span>
              <span className={displayRow.nameClassName}>
                {displayRow.name}
              </span>
              <span className={displayRow.targetClassName}>
                {displayRow.targetValueLabel}
              </span>
            </div>
          );
        })}
      </div>

      {conversionPreview.warning && (
        <div className="text-amber-400">{conversionPreview.warning}</div>
      )}
    </div>
  );
}
