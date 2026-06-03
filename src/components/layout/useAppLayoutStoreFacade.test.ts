import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useReconstructionStore } from '../../store/reconstructionStore';
import { useGuideStore } from '../../store/stores/guideStore';
import { useNotificationStore } from '../../store/stores/notificationStore';
import { useUIStore } from '../../store/stores/uiStore';
import { buildReconstruction } from '../../test/builders/colmapBuilders';
import { useAppLayoutStoreFacade } from './useAppLayoutStoreFacade';

describe('useAppLayoutStoreFacade', () => {
  beforeEach(() => {
    useGuideStore.setState(useGuideStore.getInitialState(), true);
    useNotificationStore.setState(useNotificationStore.getInitialState(), true);
    useReconstructionStore.setState(useReconstructionStore.getInitialState(), true);
    useUIStore.setState(useUIStore.getInitialState(), true);
  });

  it('collects app layout dependencies from owning stores', () => {
    const reconstruction = buildReconstruction();

    useUIStore.setState({
      galleryCollapsed: true,
      embedMode: true,
      touchMode: true,
      touchUI: {
        statusBar: false,
        galleryFAB: true,
        galleryDrawer: true,
        modalControls: false,
      },
    });
    useReconstructionStore.setState({
      reconstruction,
      urlLoading: true,
    });

    const { result } = renderHook(() => useAppLayoutStoreFacade());

    expect(result.current.data).toEqual({
      galleryCollapsed: true,
      embedMode: true,
      touchMode: true,
      touchUI: {
        statusBar: false,
        galleryFAB: true,
        galleryDrawer: true,
        modalControls: false,
      },
      reconstruction,
      urlLoading: true,
    });
  });

  it('routes layout actions back to owning stores', () => {
    useUIStore.setState({
      touchUI: {
        statusBar: true,
        galleryFAB: true,
        galleryDrawer: true,
        modalControls: true,
      },
    });

    const { result } = renderHook(() => useAppLayoutStoreFacade());

    act(() => {
      result.current.actions.setTouchUIVisible('galleryDrawer', false);
      result.current.actions.showGuideTip('contextMenu', 'Right-click anywhere for quick actions');
    });

    expect(useUIStore.getState().touchUI.galleryDrawer).toBe(false);
    expect(useGuideStore.getState().tipShownCounts.contextMenu).toBe(1);
  });
});
