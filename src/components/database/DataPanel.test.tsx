import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useReconstructionStore } from '../../store';
import {
  buildCamera,
  buildImage,
  buildReconstruction,
} from '../../test/builders';
import { CameraModelId } from '../../types/colmap';
import { DataPanel } from './DataPanel';

describe('DataPanel', () => {
  beforeEach(() => {
    useReconstructionStore.setState(useReconstructionStore.getInitialState(), true);
  });

  it('uses a compact dropdown section selector and table-based entries', () => {
    useReconstructionStore.setState({
      reconstruction: buildReconstruction({
        cameras: [
          buildCamera({
            cameraId: 7,
            modelId: CameraModelId.PINHOLE,
            width: 1024,
            height: 768,
            params: [900],
          }),
        ],
        images: [
          buildImage({
            imageId: 20,
            cameraId: 7,
            name: 'dense/images/frame-020.jpg',
            numPoints2D: 54,
          }),
        ],
        globalStats: {
          totalPoints: 1234,
          avgTrackLength: 3.456,
        },
      }),
    });

    render(<DataPanel />);

    const selector = screen.getByRole('combobox', { name: 'Data section' });
    expect(selector).toHaveValue('cameras');
    expect(selector).toHaveClass('text-xs');
    expect(screen.getByRole('table')).toHaveClass('text-xs');
    expect(screen.getByText('OpenCV K')).toHaveAttribute('title', 'PINHOLE (1)');
    expect(screen.getByText('1024x768')).toBeInTheDocument();

    fireEvent.change(selector, { target: { value: 'images' } });
    expect(screen.getByText('dense/images/frame-020.jpg')).toBeInTheDocument();
    expect(screen.getByText('54')).toBeInTheDocument();

    fireEvent.change(selector, { target: { value: 'points' } });
    expect(screen.getByText('Metric')).toBeInTheDocument();
    expect(screen.getByText('Total Points')).toBeInTheDocument();
    expect(screen.getByText('1,234')).toBeInTheDocument();
  });
});
