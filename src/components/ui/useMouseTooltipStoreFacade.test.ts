import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useUIStore } from '../../store/stores/uiStore';
import { useMouseTooltipStoreFacade } from './useMouseTooltipStoreFacade';

describe('useMouseTooltipStoreFacade', () => {
  beforeEach(() => {
    useUIStore.setState(useUIStore.getInitialState(), true);
  });

  it('collects touch mode for mouse-tooltip rendering', () => {
    useUIStore.setState({ touchMode: true });

    const { result } = renderHook(() => useMouseTooltipStoreFacade());

    expect(result.current.touchMode).toBe(true);
  });
});
