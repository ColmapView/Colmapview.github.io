import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { FrustumPlaneHoverCard } from './FrustumPlaneHoverCard';

afterEach(() => {
  cleanup();
});

describe('FrustumPlaneHoverCard', () => {
  it('renders selected perspective actions and multi-camera metadata', () => {
    render(
      <FrustumPlaneHoverCard
        imageName="cam-a/photo.jpg"
        imageId={12}
        cameraId={3}
        multiCamera
        numPoints3D={42}
        isSelected
        isMatched={false}
        wouldGoBack
        cameraProjection="perspective"
      />
    );

    expect(screen.getByText('cam-a/photo.jpg')).toBeVisible();
    expect(screen.getByText('#3:12')).toBeVisible();
    expect(screen.getByText('42 points')).toBeVisible();
    expect(screen.getByText('Scroll: FOV')).toBeVisible();
    expect(screen.getByText('Left: details')).toBeVisible();
    expect(screen.getByText('Right: back')).toBeVisible();
    expect(screen.getByText('(U) undistort')).toBeVisible();
  });

  it('renders unselected actions without selected-only hints', () => {
    render(
      <FrustumPlaneHoverCard
        imageName="photo.jpg"
        imageId={7}
        cameraId={1}
        multiCamera={false}
        numPoints3D={0}
        isSelected={false}
        isMatched
        wouldGoBack={false}
        cameraProjection="orthographic"
      />
    );

    expect(screen.getByText('#7')).toBeVisible();
    expect(screen.getByText('0 points')).toBeVisible();
    expect(screen.getByText('Left: select')).toBeVisible();
    expect(screen.getByText('Right: matches')).toBeVisible();
    expect(screen.queryByText('Scroll: FOV')).toBeNull();
    expect(screen.queryByText('(U) undistort')).toBeNull();
  });

  it('renders fly-to as the default unselected right-click action', () => {
    render(
      <FrustumPlaneHoverCard
        imageName="next.jpg"
        imageId={8}
        cameraId={1}
        multiCamera={false}
        numPoints3D={12}
        isSelected={false}
        isMatched={false}
        wouldGoBack={false}
        cameraProjection="orthographic"
      />
    );

    expect(screen.getByText('Left: select')).toBeVisible();
    expect(screen.getByText('Right: fly to')).toBeVisible();
    expect(screen.queryByText('Right: back')).toBeNull();
    expect(screen.queryByText('Right: matches')).toBeNull();
  });
});
