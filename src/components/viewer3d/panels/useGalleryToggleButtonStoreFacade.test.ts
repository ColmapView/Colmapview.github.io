import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useUIStore } from '../../../store';
import { useGalleryToggleButtonStoreFacade } from './useGalleryToggleButtonStoreFacade';

describe('useGalleryToggleButtonStoreFacade', () => {
  beforeEach(() => {
    useUIStore.setState(useUIStore.getInitialState(), true);
  });

  it('collects gallery toggle state from the UI store', () => {
    useUIStore.setState({
      galleryCollapsed: true,
      embedMode: false,
      touchMode: true,
      touchUI: {
        statusBar: true,
        galleryFAB: true,
        galleryDrawer: true,
        modalControls: true,
      },
    });

    const { result } = renderHook(() => useGalleryToggleButtonStoreFacade());

    expect(result.current.data).toEqual({
      galleryCollapsed: true,
      embedMode: false,
      touchMode: true,
      touchGalleryDrawer: true,
    });
  });

  it('routes desktop and touch gallery actions to the UI store', () => {
    const { result } = renderHook(() => useGalleryToggleButtonStoreFacade());

    act(() => {
      result.current.actions.toggleGalleryCollapsed();
      result.current.actions.toggleTouchGalleryDrawer();
    });

    expect(useUIStore.getState().galleryCollapsed).toBe(true);
    expect(useUIStore.getState().touchUI.galleryDrawer).toBe(true);
  });
});
