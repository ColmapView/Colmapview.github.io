import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ConversionPreview } from '../../utils/cameraModelConversions';
import { CameraConversionPreview } from './CameraConversionPreview';

describe('CameraConversionPreview', () => {
  it('renders characterization and parameter row display state', () => {
    render(
      <CameraConversionPreview
        conversionPreview={buildPreview()}
        parameterRows={[
          { name: 'f', sourceValue: null, targetValue: 510, status: 'new' },
          { name: 'cx', sourceValue: 320, targetValue: 330, status: 'changed' },
          { name: 'old', sourceValue: 5, targetValue: 0, status: 'removed' },
        ]}
      />
    );

    expect(screen.getByText('Expansion')).toHaveClass('text-blue-400');
    expect(screen.getByText('Adding a focal parameter')).toHaveClass('text-ds-muted');
    expect(screen.getByText('Expansion warning')).toHaveClass('text-amber-400');
    expect(screen.getByText('f')).toHaveClass('text-blue-400');
    expect(screen.getByText('5.10e+2')).toHaveClass('text-blue-400');
    expect(screen.getByText('3.30e+2')).toHaveClass('text-amber-400');
    expect(screen.getByText('old')).toHaveClass('text-red-400');
    expect(screen.getByText('5')).toHaveClass('text-red-400', 'line-through');
  });
});

function buildPreview(): ConversionPreview {
  return {
    sourceParamNames: [],
    sourceParams: [],
    targetParamNames: [],
    targetParams: [],
    characterization: 'expansion',
    isLossy: false,
    isExpansion: true,
    description: 'Adding a focal parameter',
    warning: 'Expansion warning',
  };
}
