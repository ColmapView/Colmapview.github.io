import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { BufferGeometry } from 'three';
import { SelectionOverlay, type SelectionOverlayProps } from './SelectionOverlay';

vi.mock('../../../hooks/pointCloud/useSelectionAnimation', () => ({
  useSelectionAnimation: () => ({ selectedMaterialRef: { current: null } }),
}));

describe('selection overlay resources', () => {
  it('uploads positions only and retains geometry when the uniform color changes', () => {
    const props: SelectionOverlayProps = {
      selectedPositions: new Float32Array([1, 2, 3]), pointSize: 2,
      selectedImageId: 1, selectionColorMode: 'static',
      selectionAnimationSpeed: 1, selectionColor: '#ff0000',
    };
    const { result, rerender, unmount } = renderHook(SelectionOverlay, { initialProps: props });
    const geometry = (result.current.props as { geometry: BufferGeometry }).geometry;
    const dispose = vi.spyOn(geometry, 'dispose');
    expect(Object.keys(geometry.attributes)).toEqual(['position']);
    expect(geometry.getAttribute('position').array).toBe(props.selectedPositions);
    rerender({ ...props, selectionColor: '#00ff00' });
    expect((result.current.props as { geometry: BufferGeometry }).geometry).toBe(geometry);
    expect(dispose).not.toHaveBeenCalled();
    unmount();
    expect(dispose).toHaveBeenCalledTimes(1);
  });
});
