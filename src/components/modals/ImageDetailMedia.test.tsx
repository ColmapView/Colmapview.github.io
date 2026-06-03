import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { buildCamera, buildPoint2D } from '../../test/builders';
import {
  CameraPoseInfoDisplay,
  DeletedCrossOverlay,
  ImagePlaceholder,
  KeypointCanvas,
} from './ImageDetailMedia';

afterEach(() => {
  cleanup();
});

describe('ImageDetailMedia', () => {
  it('renders camera pose values with signed display classes', () => {
    const { getByText } = render(
      <CameraPoseInfoDisplay
        camera={buildCamera()}
        qvec={[0.7, -0.2, 0.123, 1.234]}
        tvec={[-1.23, 0, 2.34]}
      />
    );

    expect(getByText('-0.200')).toHaveClass('text-ds-error');
    expect(getByText('0.123')).toHaveClass('text-ds-primary');
    expect(getByText('-1.23')).toHaveClass('text-ds-error');
    expect(getByText('2.34')).toHaveClass('text-ds-primary');
  });

  it('renders keypoint canvases centered over the image area', () => {
    const { container } = render(
      <KeypointCanvas
        points2D={[buildPoint2D({ xy: [10, 20] })]}
        camera={buildCamera()}
        imageWidth={200}
        imageHeight={100}
        containerWidth={300}
        containerHeight={180}
        showPoints2D
        showPoints3D={false}
      />
    );

    const canvas = getOnlyCanvas(container);
    expect(canvas).toHaveAttribute('width', '200');
    expect(canvas).toHaveAttribute('height', '100');
    expect(canvas).toHaveStyle({
      left: '50px',
      top: '40px',
    });
  });

  it('does not render keypoint canvases without a renderable image area', () => {
    const { container } = render(
      <KeypointCanvas
        points2D={[buildPoint2D({ xy: [10, 20] })]}
        camera={buildCamera()}
        imageWidth={0}
        imageHeight={100}
        containerWidth={300}
        containerHeight={180}
        showPoints2D
        showPoints3D={false}
      />
    );

    expect(container.querySelector('canvas')).toBeNull();
  });

  it('renders placeholder and deleted overlay canvases with merged dimensions', () => {
    const { container: placeholderContainer } = render(
      <ImagePlaceholder
        width={120}
        height={60}
        cameraWidth={640}
        cameraHeight={480}
        label="missing.jpg"
        style={{ position: 'absolute', left: 10, top: 20 }}
      />
    );
    const placeholder = getOnlyCanvas(placeholderContainer);

    expect(placeholder).toHaveAttribute('width', '120');
    expect(placeholder).toHaveAttribute('height', '60');
    expect(placeholder).toHaveStyle({
      position: 'absolute',
      left: '10px',
      top: '20px',
      width: '120px',
      height: '60px',
    });

    const { container: overlayContainer } = render(
      <DeletedCrossOverlay
        width={80}
        height={40}
        style={{ position: 'absolute', left: 5, top: 8 }}
      />
    );
    const overlay = getOnlyCanvas(overlayContainer);

    expect(overlay).toHaveAttribute('width', '80');
    expect(overlay).toHaveAttribute('height', '40');
    expect(overlay).toHaveStyle({
      position: 'absolute',
      left: '5px',
      top: '8px',
      width: '80px',
      height: '40px',
    });
  });
});

function getOnlyCanvas(container: HTMLElement): HTMLCanvasElement {
  const canvas = container.querySelector('canvas');
  if (!canvas) {
    throw new Error('Expected one canvas element');
  }

  return canvas;
}
