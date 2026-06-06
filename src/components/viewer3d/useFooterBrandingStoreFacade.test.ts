import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useUIStore } from '../../store';
import { useFooterBrandingStoreFacade } from './useFooterBrandingStoreFacade';

describe('useFooterBrandingStoreFacade', () => {
  beforeEach(() => {
    useUIStore.setState(useUIStore.getInitialState(), true);
  });

  it('collects footer layout state from the UI store', () => {
    useUIStore.setState({
      autoHideElements: {
        ...useUIStore.getState().autoHideElements,
        buttons: false,
      },
      embedMode: true,
      touchMode: true,
    });

    const { result } = renderHook(() => useFooterBrandingStoreFacade());

    expect(result.current.autoHideButtons).toBe(false);
    expect(result.current.embedMode).toBe(true);
    expect(result.current.touchMode).toBe(true);
  });
});
