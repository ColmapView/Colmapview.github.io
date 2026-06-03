import { describe, expect, it } from 'vitest';
import type { CameraViewState } from '../store/types';
import type { ColmapManifest } from '../types/manifest';
import { encodeShareData } from '../utils/shareDataCodec';
import { encodeCameraState } from '../utils/urlCameraStateCodec';
import {
  decodeCameraStateFromHash,
  getNextCameraHashUpdate,
} from './urlStateHashPolicy';

const viewState: CameraViewState = {
  position: [1, 2, 5],
  target: [1, -1, 1],
  quaternion: [0, Math.SQRT1_2, 0, Math.SQRT1_2],
  distance: 5,
};

const manifest: ColmapManifest = {
  version: 1,
  name: 'Example',
  baseUrl: 'https://example.com/data/',
  files: {
    cameras: 'sparse/0/cameras.bin',
    images: 'sparse/0/images.bin',
    points3D: 'sparse/0/points3D.bin',
  },
  imagesPath: 'images/',
};

describe('url state hash policy', () => {
  it('decodes combined share hashes before camera-only hashes', async () => {
    const combinedHash = encodeShareData(manifest, viewState, null);
    const cameraHash = encodeCameraState({
      ...viewState,
      position: [9, 9, 9],
    });

    const decoded = await decodeCameraStateFromHash(`#${combinedHash}&${cameraHash}`);

    expect(decoded?.position).toEqual(viewState.position);
  });

  it('does not fall back to camera-only data when combined data owns the hash', async () => {
    const combinedWithoutCamera = encodeShareData(manifest, null, null);
    const cameraHash = encodeCameraState(viewState);

    await expect(decodeCameraStateFromHash(`#${combinedWithoutCamera}&${cameraHash}`))
      .resolves.toBeNull();
  });

  it('decodes camera-only binary and legacy hashes', async () => {
    await expect(decodeCameraStateFromHash(encodeCameraState(viewState)))
      .resolves.toMatchObject({
        position: viewState.position,
        target: viewState.target,
      });

    await expect(decodeCameraStateFromHash(
      '#camera=1,2,5,1,-1,1,0,0.7071067811865476,0,0.7071067811865476'
    )).resolves.toMatchObject({
      distance: 5,
      position: viewState.position,
    });
  });

  it('returns null for empty or malformed camera hashes', async () => {
    await expect(decodeCameraStateFromHash('')).resolves.toBeNull();
    await expect(decodeCameraStateFromHash('#c=not-valid')).resolves.toBeNull();
    await expect(decodeCameraStateFromHash('#camera=1,2,3')).resolves.toBeNull();
  });

  it('builds a replacement URL when encoded camera state changes', () => {
    expect(getNextCameraHashUpdate({
      href: 'https://example.com/viewer/?embed=1#c=old',
      encodedState: 'c=new',
      lastEncodedState: 'c=old',
    })).toEqual({
      encodedState: 'c=new',
      url: 'https://example.com/viewer/?embed=1#c=new',
    });
  });

  it('skips URL updates when encoded camera state has not changed', () => {
    expect(getNextCameraHashUpdate({
      href: 'https://example.com/viewer/#c=same',
      encodedState: 'c=same',
      lastEncodedState: 'c=same',
    })).toBeNull();
  });
});
