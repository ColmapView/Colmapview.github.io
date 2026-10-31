import { beforeEach, describe, expect, it } from 'vitest';
import { buildImage, buildReconstruction } from '../test/builders';
import { useReconstructionStore } from './reconstructionStore';
import { useCameraStore } from './stores/cameraStore';
import { applySavedViewerState } from '../hooks/useUrlState';

// Identity rotation: the camera centre is -tvec.
function tinyRing() {
  return buildReconstruction({
    images: Array.from({ length: 104 }, (_, i) => {
      const angle = (i / 104) * Math.PI * 2;
      return buildImage({ imageId: i + 1, name: `${i}.png`, tvec: [Math.cos(angle) * 0.015, 0, Math.sin(angle) * 0.015] });
    }),
  });
}

describe('reconstruction store frustum size', () => {
  beforeEach(() => {
    useReconstructionStore.setState(useReconstructionStore.getInitialState(), true);
    useCameraStore.setState(useCameraStore.getInitialState(), true);
  });

  it('sizes frustums to the cameras of a freshly loaded scene', () => {
    useReconstructionStore.getState().setReconstruction(tinyRing());

    const { cameraScaleFactor, cameraScale } = useCameraStore.getState();
    expect(cameraScaleFactor).toBe('0.01');
    expect(Number(cameraScaleFactor) * cameraScale).toBeLessThan(0.002);
  });

  it('lets a share link size win over the automatic one', async () => {
    useReconstructionStore.getState().setReconstruction(tinyRing());

    await applySavedViewerState(null, { config: { camera: { cameraScaleFactor: '1', cameraScale: 0.4 } } });

    expect(useCameraStore.getState()).toMatchObject({ cameraScaleFactor: '1', cameraScale: 0.4 });
  });

  it('keeps the chosen size when an edit commits', () => {
    useCameraStore.setState({ cameraScaleFactor: '1', cameraScale: 0.4 });

    useReconstructionStore.getState().setReconstruction(tinyRing(), { edited: true });

    expect(useCameraStore.getState()).toMatchObject({ cameraScaleFactor: '1', cameraScale: 0.4 });
  });
});
