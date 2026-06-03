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

function createMaterialRef() {
  return { current: new THREE.MeshBasicMaterial() };
}

function renderDisplayTexture(props: HookProps = {
  isSelected: false,
  showImagePlane: true,
  viewAngleOk: true,
}) {
  const materialRef = createMaterialRef();
  const rendered = renderHook(
    (hookProps: HookProps) => useFrustumPlaneDisplayTexture({
      imageName: 'image.jpg',
      isSelected: hookProps.isSelected,
      materialRef,
      showImagePlane: hookProps.showImagePlane,
      viewAngleOk: hookProps.viewAngleOk,
    }),
    { initialProps: props }
  );

  return { ...rendered, materialRef };
}

beforeEach(() => {
  lowResTexture = null;
  highResTexture = null;
  useFrustumTextureMock.mockImplementation(() => lowResTexture);
  useSelectedImageTextureMock.mockImplementation(() => highResTexture);
});

describe('useFrustumPlaneDisplayTexture', () => {
  it('keeps the last loaded texture visible while the source texture refreshes', () => {
    lowResTexture = new THREE.Texture();
    const { result, rerender, materialRef } = renderDisplayTexture();

    expect(result.current.displayTexture).toBe(lowResTexture);
    expect(materialRef.current.map).toBe(lowResTexture);

    lowResTexture = null;
    rerender({
      isSelected: false,
      showImagePlane: true,
      viewAngleOk: true,
    });

    expect(result.current.displayTexture).toBe(materialRef.current.map);
    expect(result.current.shouldShowTexture).toBe(true);
  });

  it('uses the selected high-res texture as the latest display texture', () => {
    lowResTexture = new THREE.Texture();
    highResTexture = new THREE.Texture();
    const { result, materialRef } = renderDisplayTexture({ isSelected: true, showImagePlane: true, viewAngleOk: true });

    expect(result.current.displayTexture).toBe(highResTexture);
    expect(materialRef.current.map).toBe(highResTexture);
  });

  it('clears the material map when texture display is hidden', () => {
    lowResTexture = new THREE.Texture();
    const { result, rerender, materialRef } = renderDisplayTexture();

    expect(materialRef.current.map).toBe(lowResTexture);

    rerender({
      isSelected: false,
      showImagePlane: false,
      viewAngleOk: true,
    });

    expect(result.current.displayTexture).toBe(lowResTexture);
    expect(result.current.shouldShowTexture).toBe(false);
    expect(materialRef.current.map).toBeNull();
  });
});
