import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DatasetManager } from '../../dataset';
import { useSelectedFrustumImageFile } from './useSelectedFrustumImageFile';

function datasetFor(base: string) {
  return new DatasetManager(() => ({ sourceType: 'url', imageUrlBase: base, maskUrlBase: null, imageNameToUrl: null, loadedFiles: null }));
}

describe('selected frustum image request identity', () => {
  it('does not display the previous dataset image while the same name is pending or missing', async () => {
    const a = datasetFor('https://a.example/');
    const b = datasetFor('https://b.example/');
    const oldFile = new File(['old'], 'same.jpg');
    vi.spyOn(a, 'getImage').mockResolvedValue(oldFile);
    let complete!: (file: File | null) => void;
    const loadB = vi.spyOn(b, 'getImage').mockImplementation(() => new Promise(resolve => { complete = resolve; }));
    const { result, rerender, unmount } = renderHook(({ dataset }) => useSelectedFrustumImageFile({
      dataset, imageName: 'same.jpg', isSelected: true, showImagePlane: true,
    }), { initialProps: { dataset: a } });
    await waitFor(() => expect(result.current).toBe(oldFile));
    rerender({ dataset: b });
    expect(result.current).toBeUndefined();
    await act(async () => { complete(null); });
    expect(result.current).toBeUndefined();
    const options = loadB.mock.calls[0][1]!;
    expect(options.priority).toBe('selected');
    expect(options.signal!.aborted).toBe(false);
    unmount();
    expect(options.signal!.aborted).toBe(true);
  });
});
