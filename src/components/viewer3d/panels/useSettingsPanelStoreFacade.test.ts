import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useUIStore } from '../../../store';
import { useSettingsPanelStoreFacade } from './useSettingsPanelStoreFacade';

describe('useSettingsPanelStoreFacade', () => {
  beforeEach(() => {
    useUIStore.setState(useUIStore.getInitialState(), true);
  });

  it('collects settings-panel dependencies from the UI store', () => {
    useUIStore.setState({ idleHideTimeout: 7 });

    const { result } = renderHook(() => useSettingsPanelStoreFacade());

    expect(result.current.ui.idleHideTimeout).toBe(7);
    expect(typeof result.current.ui.setIdleHideTimeout).toBe('function');
    expect(typeof result.current.ui.setShowAutoHideEditor).toBe('function');
    expect(typeof result.current.ui.openContextMenuEditor).toBe('function');
  });

  it('routes settings actions back to the UI store', () => {
    const { result } = renderHook(() => useSettingsPanelStoreFacade());

    act(() => {
      result.current.ui.setIdleHideTimeout(5);
      result.current.ui.setShowAutoHideEditor(true);
      result.current.ui.openContextMenuEditor();
    });

    expect(useUIStore.getState()).toMatchObject({
      idleHideTimeout: 5,
      showAutoHideEditor: true,
      showContextMenuEditor: true,
    });
  });
});
