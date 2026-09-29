import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { usePublicationStatusStore } from '../../store';
import { useHuggingFacePublishButtonStoreFacade } from './useHuggingFacePublishButtonStoreFacade';

describe('useHuggingFacePublishButtonStoreFacade', () => {
  beforeEach(() => usePublicationStatusStore.setState(usePublicationStatusStore.getInitialState(), true));

  it('reports an active publication until it returns to idle', () => {
    const { result } = renderHook(() => useHuggingFacePublishButtonStoreFacade());
    expect(result.current.publicationActive).toBe(false);
    act(() => usePublicationStatusStore.setState({ phase: 'uploading' }));
    expect(result.current.publicationActive).toBe(true);
    act(() => usePublicationStatusStore.setState({ phase: 'idle' }));
    expect(result.current.publicationActive).toBe(false);
  });
});
