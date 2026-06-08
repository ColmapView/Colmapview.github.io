import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi, type MockedFunction } from 'vitest';
import * as THREE from 'three';
import { useFrustumTexture, useSelectedImageTexture } from '../../hooks/useFrustumTexture';
import { useFrustumPlaneDisplayTexture } from './useFrustumPlaneDisplayTexture';

vi.mock('../../hooks/useFrustumTexture', () => ({
  useFrustumTexture: vi.fn(),
  useSelectedImageTexture: vi.fn(),
}));

interface HookProps {
  isSelected: boolean;
  showImagePlane: boolean;
  viewAngleOk: boolean;
}

const useFrustumTextureMock = useFrustumTexture as MockedFunction<typeof useFrustumTexture>;
const useSelectedImageTextureMock = useSelectedImageTexture as MockedFunction<typeof useSelectedImageTexture>;

let lowResTexture: THREE.Texture | null;
let highResTexture: THREE.Texture | null;

function renderDisplayTexture(props: HookProps = {
  isSelected: false,
  showImagePlane: true,
  viewAngleOk: true,
}) {
  return renderHook(
    (hookProps: HookProps) => useFrustumPlaneDisplayTexture({
      imageName: 'image.jpg',
      isSelected: hookProps.isSelected,
      showImagePlane: hookProps.showImagePlane,
      viewAngleOk: hookProps.viewAngleOk,
    }),
    { initialProps: props }
  );
}

beforeEach(() => {
  lowResTexture = null;
  highResTexture = null;
  useFrustumTextureMock.mockImplementation(() => lowResTexture);
  useSelectedImageTextureMock.mockImplementation(() => highResTexture);
});

describe('useFrustumPlaneDisplayTexture', () => {
  it('uses only the current source texture', () => {
    lowResTexture = createRenderableTexture();
    const { result, rerender } = renderDisplayTexture();

    expect(result.current.displayTexture).toBe(lowResTexture);
    expect(result.current.shouldShowTexture).toBe(true);

    lowResTexture = null;
    rerender({
      isSelected: false,
      showImagePlane: true,
      viewAngleOk: true,
    });

    expect(result.current.displayTexture).toBeNull();
    expect(result.current.shouldShowTexture).toBe(false);
  });

  it('uses the selected high-res texture as the latest display texture', () => {
    lowResTexture = createRenderableTexture();
    highResTexture = createRenderableTexture();
    const { result } = renderDisplayTexture({ isSelected: true, showImagePlane: true, viewAngleOk: true });

    expect(result.current.displayTexture).toBe(highResTexture);
    expect(result.current.shouldShowTexture).toBe(true);
  });

  it('keeps the texture reference but does not show it when image planes are disabled', () => {
    lowResTexture = createRenderableTexture();
    const { result, rerender } = renderDisplayTexture();

    rerender({
      isSelected: false,
      showImagePlane: false,
      viewAngleOk: true,
    });

    expect(result.current.displayTexture).toBe(lowResTexture);
    expect(result.current.shouldShowTexture).toBe(false);
    expect(result.current.textureHiddenByViewAngle).toBe(false);
  });

  it('keeps a renderable texture available when it is hidden by view-angle culling', () => {
    lowResTexture = createRenderableTexture();
    const { result } = renderDisplayTexture({
      isSelected: false,
      showImagePlane: true,
      viewAngleOk: false,
    });

    expect(result.current.displayTexture).toBe(lowResTexture);
    expect(result.current.shouldShowTexture).toBe(false);
    expect(result.current.textureHiddenByViewAngle).toBe(true);
  });

  it('does not show an invalid texture object as an image-plane preview', () => {
    lowResTexture = new THREE.Texture();
    const { result } = renderDisplayTexture();

    expect(result.current.displayTexture).toBe(lowResTexture);
    expect(result.current.shouldShowTexture).toBe(false);
    expect(result.current.textureHiddenByViewAngle).toBe(false);
  });
});

function createRenderableTexture(): THREE.Texture {
  return new THREE.Texture({ width: 64, height: 32 } as unknown as ImageBitmap);
}
