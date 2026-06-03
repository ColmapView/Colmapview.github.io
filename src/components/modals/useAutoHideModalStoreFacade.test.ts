import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useUIStore } from '../../store';
import { useAutoHideModalStoreFacade } from './useAutoHideModalStoreFacade';

describe('useAutoHideModalStoreFacade', () => {
  beforeEach(() => {
    useUIStore.setState(useUIStore.getInitialState(), true);
  });

  it('collects auto-hide modal dependencies from the UI store', () => {
    useUIStore.setState({
      autoHideElements: {
        buttons: true,
        axes: false,
        grid: true,
        gizmo: false,
        points: true,
        cameras: false,
        matches: true,
        rigs: false,
      },
    });

    const { result } = renderHook(() => useAutoHideModalStoreFacade());

    expect(result.current.data.autoHideElements).toMatchObject({
      buttons: true,
      grid: true,
      points: true,
      matches: true,
    });
    expect(typeof result.current.actions.setAutoHideElement).toBe('function');
  });

  it('routes auto-hide updates back to the UI store', () => {
    const { result } = renderHook(() => useAutoHideModalStoreFacade());

    act(() => {
      result.current.actions.setAutoHideElement('grid', true);
      result.current.actions.setAutoHideElement('buttons', false);
    });

    expect(useUIStore.getState().autoHideElements).toMatchObject({
      grid: true,
      buttons: false,
    });
  });
});
