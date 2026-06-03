import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useUIStore } from '../../store';
import { useFooterBrandingStoreFacade } from './useFooterBrandingStoreFacade';

describe('useFooterBrandingStoreFacade', () => {
  beforeEach(() => {
    useUIStore.setState(useUIStore.getInitialState(), true);
  });

  it('collects button auto-hide visibility from the UI store', () => {
    useUIStore.setState({
      autoHideElements: {
        ...useUIStore.getState().autoHideElements,
        buttons: false,
      },
    });

    const { result } = renderHook(() => useFooterBrandingStoreFacade());

    expect(result.current.autoHideButtons).toBe(false);
  });
});
