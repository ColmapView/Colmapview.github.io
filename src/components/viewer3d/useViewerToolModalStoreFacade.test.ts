import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useUIStore } from '../../store';
import { useViewerToolModalStoreFacade } from './useViewerToolModalStoreFacade';

describe('useViewerToolModalStoreFacade', () => {
  beforeEach(() => {
    useUIStore.setState(useUIStore.getInitialState(), true);
  });

  it('collects viewer tool modal state from the UI store', () => {
    useUIStore.setState({
      showFloorModal: true,
      showDeletionModal: false,
      showConversionModal: true,
      showAutoHideEditor: false,
    });

    const { result } = renderHook(() => useViewerToolModalStoreFacade());

    expect(result.current).toMatchObject({
      showFloorModal: true,
      showDeletionModal: false,
      showConversionModal: true,
      showAutoHideEditor: false,
    });
  });

  it('routes modal visibility updates back to the UI store', () => {
    const { result } = renderHook(() => useViewerToolModalStoreFacade());

    act(() => {
      result.current.setShowFloorModal(true);
      result.current.setShowDeletionModal(true);
      result.current.setShowConversionModal(true);
      result.current.setShowAutoHideEditor(true);
    });

    expect(useUIStore.getState()).toMatchObject({
      showFloorModal: true,
      showDeletionModal: true,
      showConversionModal: true,
      showAutoHideEditor: true,
    });
  });
});
