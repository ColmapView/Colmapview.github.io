import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LoadedFiles } from '../types/colmap';
import { abandonUrlAutoLoadRequest, hasUrlToLoad, useReconstructionStore } from './reconstructionStore';
import { usePointCloudStore } from './stores/pointCloudStore';
import { useSplatBackendStore } from './stores/splatBackendStore';
import { useTransformStore } from './stores/transformStore';
import { useUIStore } from './stores/uiStore';
import { isSplatColorMode } from './types';
import {
  clearGaussianCloudLoadCacheForTests,
  loadGaussianCloudFromFile,
} from '../splat/gaussianCloudLoader';
import type { GaussianCloud } from '../splat/gaussianCloud';

// Byte-less activation seams: the decode step is mocked (no real gs-toolbox
// decode in store tests), while seedGaussianCloudLoad / loadGaussianCloudFromFile
// stay REAL so the tests can verify the decode cache actually got seeded under
// the placeholder File. detectTouchDevice defaults to desktop; touch tests
// override per test.
const loadGaussianCloudFromBytesMock = vi.hoisted(() => vi.fn());
const detectTouchDeviceMock = vi.hoisted(() => vi.fn(() => false));

vi.mock('../splat/gaussianCloudLoader', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../splat/gaussianCloudLoader')>();
  return { ...actual, loadGaussianCloudFromBytes: loadGaussianCloudFromBytesMock };
});

vi.mock('../hooks/useIsTouchDevice', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../hooks/useIsTouchDevice')>();
  return { ...actual, detectTouchDevice: detectTouchDeviceMock };
});

function baseLoadedFiles(overrides: Partial<LoadedFiles>): LoadedFiles {
  return {
    camerasFile: new File([''], 'cameras.bin'),
    imagesFile: new File([''], 'images.bin'),
    points3DFile: new File([''], 'points3D.bin'),
    imageFiles: new Map(),
    hasMasks: false,
    ...overrides,
  };
}

describe('reconstruction store URL load lifecycle', () => {
  beforeEach(() => {
    useReconstructionStore.setState(useReconstructionStore.getInitialState(), true);
    usePointCloudStore.setState(usePointCloudStore.getInitialState(), true);
    useTransformStore.setState(useTransformStore.getInitialState(), true);
    useUIStore.setState(useUIStore.getInitialState(), true);
  });

  it('serializes URL loads independently from the visible loading indicator', () => {
    useReconstructionStore.setState({ urlLoading: true });

    expect(useReconstructionStore.getState().tryStartUrlLoad()).toBe(true);
    expect(useReconstructionStore.getState().tryStartUrlLoad()).toBe(false);

    useReconstructionStore.getState().finishUrlLoad();

    expect(useReconstructionStore.getState().tryStartUrlLoad()).toBe(true);
  });

  it('clears active URL load state when the reconstruction is cleared', () => {
    expect(useReconstructionStore.getState().tryStartUrlLoad()).toBe(true);

    useReconstructionStore.getState().clear();

    expect(useReconstructionStore.getState().tryStartUrlLoad()).toBe(true);
  });

  it('uses a black default background when a splat file starts loading', () => {
    const splatFile = new File(['splat'], 'scene.spz');

    useUIStore.setState({ backgroundColor: '#ffffff' });

    useReconstructionStore.getState().setLoadedFiles({
      camerasFile: new File([''], 'cameras.bin'),
      imagesFile: new File([''], 'images.bin'),
      points3DFile: new File([''], 'points3D.bin'),
      splatFile,
      splatFiles: [splatFile],
      imageFiles: new Map(),
      hasMasks: false,
    });

    expect(useUIStore.getState().backgroundColor).toBe('#000000');
  });

  it('preserves custom background colors when a splat file starts loading', () => {
    const splatFile = new File(['splat'], 'scene.spz');

    useUIStore.setState({ backgroundColor: '#123456' });

    useReconstructionStore.getState().setLoadedFiles({
      camerasFile: new File([''], 'cameras.bin'),
      imagesFile: new File([''], 'images.bin'),
      points3DFile: new File([''], 'points3D.bin'),
      splatFile,
      splatFiles: [splatFile],
      imageFiles: new Map(),
      hasMasks: false,
    });

    expect(useUIStore.getState().backgroundColor).toBe('#123456');
  });

  it('switches point cloud display to splats plus points when loaded files include a splat', () => {
    const splatFile = new File(['splat'], 'scene.spz');

    usePointCloudStore.setState({
      colorMode: 'rgb',
      showSplats: false,
      pointSize: 7,
      pointOpacity: 0.9,
    });

    useReconstructionStore.getState().setLoadedFiles({
      camerasFile: new File([''], 'cameras.bin'),
      imagesFile: new File([''], 'images.bin'),
      points3DFile: new File([''], 'points3D.bin'),
      splatFile,
      splatFiles: [splatFile],
      imageFiles: new Map(),
      hasMasks: false,
    });

    expect(usePointCloudStore.getState().colorMode).toBe('splatPoints');
    expect(usePointCloudStore.getState().showSplats).toBe(true);
    expect(usePointCloudStore.getState().pointSize).toBe(1);
    expect(usePointCloudStore.getState().pointOpacity).toBe(0.2);
  });

  it('downgrades a persisted splat color mode to RGB when a splat-less dataset loads', () => {
    // A splat color mode survives from a previous (splat) dataset via persistence;
    // loading a dataset with no splat must drop it so the COLMAP points stay visible.
    usePointCloudStore.setState({ colorMode: 'splats', showSplats: true });

    useReconstructionStore.getState().setLoadedFiles({
      camerasFile: new File([''], 'cameras.bin'),
      imagesFile: new File([''], 'images.bin'),
      points3DFile: new File([''], 'points3D.bin'),
      imageFiles: new Map(),
      hasMasks: false,
    });

    expect(usePointCloudStore.getState().colorMode).toBe('rgb');
    expect(usePointCloudStore.getState().showSplats).toBe(false);
  });

  it('restores the plain point size and opacity when a splat-less dataset loads over a splat preset', () => {
    // applySplatPointDisplayDefaults shrinks points to the splat-visible preset
    // (size 1, opacity 0.2) and persists it. Loading a splat-less dataset must undo
    // that preset, not just the color mode, or the COLMAP points render as tiny,
    // near-invisible dots carried over from the previous splat session.
    usePointCloudStore.setState({
      colorMode: 'splats',
      showSplats: true,
      pointSize: 1,
      pointOpacity: 0.2,
    });

    useReconstructionStore.getState().setLoadedFiles({
      camerasFile: new File([''], 'cameras.bin'),
      imagesFile: new File([''], 'images.bin'),
      points3DFile: new File([''], 'points3D.bin'),
      imageFiles: new Map(),
      hasMasks: false,
    });

    expect(usePointCloudStore.getState().colorMode).toBe('rgb');
    expect(usePointCloudStore.getState().showSplats).toBe(false);
    expect(usePointCloudStore.getState().pointSize).toBe(2);
    expect(usePointCloudStore.getState().pointOpacity).toBe(1);
  });

  it('preserves a user point size and opacity on a splat-less load when the prior mode is not a splat mode', () => {
    // The restore is gated on a splat color mode: when the user is already on a
    // non-splat mode with their own size/opacity, a splat-less load must not clobber
    // their choices back to the defaults.
    usePointCloudStore.setState({
      colorMode: 'rgb',
      showSplats: false,
      pointSize: 5,
      pointOpacity: 0.9,
    });

    useReconstructionStore.getState().setLoadedFiles({
      camerasFile: new File([''], 'cameras.bin'),
      imagesFile: new File([''], 'images.bin'),
      points3DFile: new File([''], 'points3D.bin'),
      imageFiles: new Map(),
      hasMasks: false,
    });

    expect(usePointCloudStore.getState().colorMode).toBe('rgb');
    expect(usePointCloudStore.getState().pointSize).toBe(5);
    expect(usePointCloudStore.getState().pointOpacity).toBe(0.9);
  });

  it('keeps a splat color mode when the loaded dataset still has a selectable splat source', () => {
    const fileB = new File(['b'], 'b.ply');
    usePointCloudStore.setState({ colorMode: 'splats', showSplats: true });

    // Lazy/pickable source with no active splatFile: the user can still activate a
    // splat, so the color mode must NOT be downgraded.
    useReconstructionStore.getState().setLoadedFiles({
      camerasFile: new File([''], 'cameras.bin'),
      imagesFile: new File([''], 'images.bin'),
      points3DFile: new File([''], 'points3D.bin'),
      splatFileSources: [{ id: 'splats/b.ply', path: 'splats/b.ply', file: fileB }],
      imageFiles: new Map(),
      hasMasks: false,
    });

    expect(usePointCloudStore.getState().colorMode).toBe('splats');
    expect(usePointCloudStore.getState().showSplats).toBe(true);
  });

  it('does not downgrade the splat color mode when the loaded dataset includes a splat file', () => {
    const splatFile = new File(['splat'], 'scene.spz');
    usePointCloudStore.setState({ colorMode: 'splats', showSplats: true });

    useReconstructionStore.getState().setLoadedFiles({
      camerasFile: new File([''], 'cameras.bin'),
      imagesFile: new File([''], 'images.bin'),
      points3DFile: new File([''], 'points3D.bin'),
      splatFile,
      splatFiles: [splatFile],
      imageFiles: new Map(),
      hasMasks: false,
    });

    // A splat is present: display defaults switch to splatPoints (still a splat mode);
    // the load-time downgrade must never fire.
    expect(isSplatColorMode(usePointCloudStore.getState().colorMode)).toBe(true);
    expect(usePointCloudStore.getState().showSplats).toBe(true);
  });

  it('preserves point rendering mode, size, and opacity when only the active splat file changes', () => {
    const camerasFile = new File([''], 'cameras.bin');
    const imagesFile = new File([''], 'images.bin');
    const points3DFile = new File([''], 'points3D.bin');
    const firstSplatFile = new File(['splat-a'], 'scene-a.spz');
    const secondSplatFile = new File(['splat-b'], 'scene-b.spz');
    const imageFiles = new Map<string, File>();

    useReconstructionStore.getState().setLoadedFiles({
      camerasFile,
      imagesFile,
      points3DFile,
      splatFile: firstSplatFile,
      splatFiles: [firstSplatFile],
      imageFiles,
      hasMasks: false,
    });
    usePointCloudStore.setState({
      colorMode: 'rgb',
      showSplats: false,
      pointSize: 5,
      pointOpacity: 0.65,
    });

    useReconstructionStore.getState().setLoadedFiles({
      camerasFile,
      imagesFile,
      points3DFile,
      splatFile: secondSplatFile,
      splatFiles: [firstSplatFile, secondSplatFile],
      imageFiles,
      hasMasks: false,
    });

    expect(usePointCloudStore.getState().colorMode).toBe('rgb');
    expect(usePointCloudStore.getState().showSplats).toBe(false);
    expect(usePointCloudStore.getState().pointSize).toBe(5);
    expect(usePointCloudStore.getState().pointOpacity).toBe(0.65);
  });

  it('resolves a requested active splat source when loaded files arrive', () => {
    const camerasFile = new File([''], 'cameras.bin');
    const imagesFile = new File([''], 'images.bin');
    const points3DFile = new File([''], 'points3D.bin');
    const defaultSplatFile = new File(['splat-a'], 'scene-a.spz');
    const requestedSplatFile = new File(['splat-b'], 'scene-b.spz');
    const imageFiles = new Map<string, File>();

    useReconstructionStore.getState().setRequestedSplatSourceId('splats/scene-b.spz');

    useReconstructionStore.getState().setLoadedFiles({
      camerasFile,
      imagesFile,
      points3DFile,
      splatFile: defaultSplatFile,
      splatFiles: [defaultSplatFile, requestedSplatFile],
      splatFileSources: [
        { id: 'splats/scene-a.spz', path: 'splats/scene-a.spz', file: defaultSplatFile },
        { id: 'splats/scene-b.spz', path: 'splats/scene-b.spz', file: requestedSplatFile },
      ],
      imageFiles,
      hasMasks: false,
    });

    expect(useReconstructionStore.getState().loadedFiles?.splatFile).toBe(requestedSplatFile);
    expect(useReconstructionStore.getState().requestedSplatSourceId).toBeNull();
  });

  it('applies splat point defaults when a splat is added to an already loaded dataset', () => {
    const camerasFile = new File([''], 'cameras.bin');
    const imagesFile = new File([''], 'images.bin');
    const points3DFile = new File([''], 'points3D.bin');
    const imageFiles = new Map<string, File>();
    const splatFile = new File(['splat'], 'scene.spz');

    useReconstructionStore.getState().setLoadedFiles({
      camerasFile,
      imagesFile,
      points3DFile,
      imageFiles,
      hasMasks: false,
    });
    usePointCloudStore.setState({ pointSize: 5, pointOpacity: 0.65 });

    useReconstructionStore.getState().setLoadedFiles({
      camerasFile,
      imagesFile,
      points3DFile,
      splatFile,
      splatFiles: [splatFile],
      imageFiles,
      hasMasks: false,
    });

    expect(usePointCloudStore.getState().colorMode).toBe('splatPoints');
    expect(usePointCloudStore.getState().pointSize).toBe(1);
    expect(usePointCloudStore.getState().pointOpacity).toBe(0.2);
  });

  it('resets accumulated splat transform when a new dataset is loaded', () => {
    useTransformStore.getState().setSplatTransform({
      scale: 2,
      rotationX: 0,
      rotationY: 0,
      rotationZ: 0,
      translationX: 1,
      translationY: 0,
      translationZ: 0,
    });

    useReconstructionStore.getState().setLoadedFiles({
      camerasFile: new File([''], 'cameras.bin'),
      imagesFile: new File([''], 'images.bin'),
      points3DFile: new File([''], 'points3D.bin'),
      splatFile: new File(['splat'], 'scene.spz'),
      imageFiles: new Map(),
      hasMasks: false,
    });

    expect(useTransformStore.getState().splatTransform).toMatchObject({
      scale: 1,
      translationX: 0,
    });
  });

  it('preserves accumulated splat transform when only the active splat file changes', () => {
    const camerasFile = new File([''], 'cameras.bin');
    const imagesFile = new File([''], 'images.bin');
    const points3DFile = new File([''], 'points3D.bin');
    const firstSplatFile = new File(['splat-a'], 'scene-a.spz');
    const secondSplatFile = new File(['splat-b'], 'scene-b.spz');
    const imageFiles = new Map<string, File>();

    useReconstructionStore.getState().setLoadedFiles({
      camerasFile,
      imagesFile,
      points3DFile,
      splatFile: firstSplatFile,
      splatFiles: [firstSplatFile],
      imageFiles,
      hasMasks: false,
    });
    useTransformStore.getState().setSplatTransform({
      scale: 2,
      rotationX: 0,
      rotationY: 0,
      rotationZ: 0,
      translationX: 1,
      translationY: 0,
      translationZ: 0,
    });

    useReconstructionStore.getState().setLoadedFiles({
      camerasFile,
      imagesFile,
      points3DFile,
      splatFile: secondSplatFile,
      splatFiles: [firstSplatFile, secondSplatFile],
      imageFiles,
      hasMasks: false,
    });

    expect(useTransformStore.getState().splatTransform).toMatchObject({
      scale: 2,
      translationX: 1,
    });
  });
});

describe('reconstruction store lazy splat source switching', () => {
  beforeEach(() => {
    useReconstructionStore.setState(useReconstructionStore.getInitialState(), true);
    usePointCloudStore.setState(usePointCloudStore.getInitialState(), true);
    useTransformStore.setState(useTransformStore.getInitialState(), true);
    useUIStore.setState(useUIStore.getInitialState(), true);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('activates a downloaded splat source and offloads the previous one', async () => {
    const fileA = new File(['a'], 'a.ply');
    const fileB = new File(['b'], 'b.ply');
    useReconstructionStore.getState().setLoadedFiles(baseLoadedFiles({
      splatFile: fileA,
      splatFiles: [fileA, fileB],
      splatFileSources: [
        { id: 'splats/a.ply', path: 'splats/a.ply', url: 'https://x/splats/a.ply', file: fileA },
        { id: 'splats/b.ply', path: 'splats/b.ply', url: 'https://x/splats/b.ply', file: fileB },
      ],
    }));

    await useReconstructionStore.getState().selectSplatSource('splats/b.ply');

    const loadedFiles = useReconstructionStore.getState().loadedFiles;
    expect(loadedFiles?.splatFile).toBe(fileB);
    expect(loadedFiles?.splatFileSources?.find((s) => s.id === 'splats/a.ply')?.file).toBeUndefined();
  });

  it('fetches a lazy splat source on demand, activates it, and offloads the previous tile', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new Blob(['splat-bytes']), { status: 200 })));
    const fileA = new File(['a'], 'a.ply');
    useReconstructionStore.getState().setLoadedFiles(baseLoadedFiles({
      splatFile: fileA,
      splatFiles: [fileA],
      splatFileSources: [
        { id: 'splats/a.ply', path: 'splats/a.ply', url: 'https://x/splats/a.ply', file: fileA },
        { id: 'splats/b.ply', path: 'splats/b.ply', url: 'https://x/splats/b.ply' },
      ],
    }));

    await useReconstructionStore.getState().selectSplatSource('splats/b.ply');

    const loadedFiles = useReconstructionStore.getState().loadedFiles;
    expect(loadedFiles?.splatFile?.name).toBe('b.ply');
    expect(loadedFiles?.splatFileSources?.find((s) => s.id === 'splats/b.ply')?.file).toBeDefined();
    expect(loadedFiles?.splatFileSources?.find((s) => s.id === 'splats/a.ply')?.file).toBeUndefined();
  });

  // Registers a controllable fetch per URL so tests can resolve/reject lazy
  // splat downloads out of order.
  function stubDeferredFetch(): Map<string, { resolve: (r: Response) => void; reject: (e: unknown) => void }> {
    const deferreds = new Map<string, { resolve: (r: Response) => void; reject: (e: unknown) => void }>();
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (url: string) =>
          new Promise<Response>((resolve, reject) => {
            deferreds.set(url, { resolve, reject });
          })
      )
    );
    return deferreds;
  }

  function threeLazySources() {
    const fileA = new File(['a'], 'a.ply');
    useReconstructionStore.getState().setLoadedFiles(baseLoadedFiles({
      splatFile: fileA,
      splatFiles: [fileA],
      splatFileSources: [
        { id: 'splats/a.ply', path: 'splats/a.ply', url: 'https://x/splats/a.ply', file: fileA },
        { id: 'splats/b.ply', path: 'splats/b.ply', url: 'https://x/splats/b.ply' },
        { id: 'splats/c.ply', path: 'splats/c.ply', url: 'https://x/splats/c.ply' },
      ],
    }));
  }

  it('latest-wins: an out-of-order lazy fetch does not overwrite a newer selection', async () => {
    const deferreds = stubDeferredFetch();
    threeLazySources();

    // Click B (slow), then C (fast).
    const pB = useReconstructionStore.getState().selectSplatSource('splats/b.ply');
    const pC = useReconstructionStore.getState().selectSplatSource('splats/c.ply');

    // C resolves first and wins; B resolves later and must be ignored.
    deferreds.get('https://x/splats/c.ply')!.resolve(new Response(new Blob(['c']), { status: 200 }));
    await pC;
    deferreds.get('https://x/splats/b.ply')!.resolve(new Response(new Blob(['b']), { status: 200 }));
    await pB;

    expect(useReconstructionStore.getState().loadedFiles?.splatFile?.name).toBe('c.ply');
    expect(useReconstructionStore.getState().requestedSplatSourceId).toBe('splats/c.ply');
  });

  it('latest-wins: a superseded fetch failure does not clobber the winner', async () => {
    const deferreds = stubDeferredFetch();
    threeLazySources();

    const pB = useReconstructionStore.getState().selectSplatSource('splats/b.ply');
    const pC = useReconstructionStore.getState().selectSplatSource('splats/c.ply');

    deferreds.get('https://x/splats/c.ply')!.resolve(new Response(new Blob(['c']), { status: 200 }));
    await pC;
    // B (already superseded) fails late — must not surface an error over C.
    deferreds.get('https://x/splats/b.ply')!.reject(new Error('network down'));
    await pB;

    expect(useReconstructionStore.getState().loadedFiles?.splatFile?.name).toBe('c.ply');
    expect(useReconstructionStore.getState().urlError).toBeNull();
  });

  it('COLMAP-only supersedes an in-flight lazy fetch and clears the loading indicator', async () => {
    const deferreds = stubDeferredFetch();
    threeLazySources();

    const pB = useReconstructionStore.getState().selectSplatSource('splats/b.ply');
    expect(useReconstructionStore.getState().urlLoading).toBe(true);

    // Switch to COLMAP-only while B is still downloading.
    await useReconstructionStore.getState().selectSplatSource('');
    expect(useReconstructionStore.getState().urlLoading).toBe(false);
    expect(useReconstructionStore.getState().urlProgress).toBeNull();
    expect(useReconstructionStore.getState().loadedFiles?.splatFile).toBeUndefined();

    // B resolves late — must not re-activate or re-show the loading overlay.
    deferreds.get('https://x/splats/b.ply')!.resolve(new Response(new Blob(['b']), { status: 200 }));
    await pB;
    expect(useReconstructionStore.getState().urlLoading).toBe(false);
    expect(useReconstructionStore.getState().loadedFiles?.splatFile).toBeUndefined();
  });

  it('sets an error and stops loading when a (non-superseded) lazy fetch fails', async () => {
    const deferreds = stubDeferredFetch();
    threeLazySources();

    const pB = useReconstructionStore.getState().selectSplatSource('splats/b.ply');
    deferreds.get('https://x/splats/b.ply')!.reject(new Error('boom'));
    await pB;

    expect(useReconstructionStore.getState().urlLoading).toBe(false);
    expect(useReconstructionStore.getState().urlProgress).toBeNull();
    expect(useReconstructionStore.getState().urlError?.message).toBe('Failed to load splat');
    // The previously active tile is left intact.
    expect(useReconstructionStore.getState().loadedFiles?.splatFile?.name).toBe('a.ply');
  });

  it('clears the active splat (COLMAP only) when selecting the empty source', async () => {
    const fileA = new File(['a'], 'a.ply');
    useReconstructionStore.getState().setLoadedFiles(baseLoadedFiles({
      splatFile: fileA,
      splatFiles: [fileA],
      splatFileSources: [{ id: 'a', path: 'a.ply', url: 'u/a', file: fileA }],
    }));

    await useReconstructionStore.getState().selectSplatSource('');

    const loadedFiles = useReconstructionStore.getState().loadedFiles;
    expect(loadedFiles?.splatFile).toBeUndefined();
    expect(loadedFiles?.splatFileSources?.find((s) => s.id === 'a')?.file).toBeUndefined();
  });

  it('switches to a splat display mode when activating a downloaded splat from COLMAP-only', async () => {
    const fileB = new File(['b'], 'b.ply');
    // COLMAP-only: the source has a downloaded file but no active splatFile yet.
    useReconstructionStore.getState().setLoadedFiles(baseLoadedFiles({
      splatFileSources: [{ id: 'splats/b.ply', path: 'splats/b.ply', file: fileB }],
    }));
    usePointCloudStore.setState({ colorMode: 'rgb', showSplats: false });

    await useReconstructionStore.getState().selectSplatSource('splats/b.ply');

    expect(usePointCloudStore.getState().colorMode).toBe('splatPoints');
    expect(usePointCloudStore.getState().showSplats).toBe(true);
  });

  it('switches to a splat display mode when a lazy splat is activated', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new Blob(['b']), { status: 200 })));
    useReconstructionStore.getState().setLoadedFiles(baseLoadedFiles({
      splatFileSources: [{ id: 'splats/b.ply', path: 'splats/b.ply', url: 'https://x/splats/b.ply' }],
    }));
    usePointCloudStore.setState({ colorMode: 'rgb', showSplats: false });

    await useReconstructionStore.getState().selectSplatSource('splats/b.ply');

    expect(usePointCloudStore.getState().colorMode).toBe('splatPoints');
    expect(usePointCloudStore.getState().showSplats).toBe(true);
  });

  it('preserves the display mode when switching between splat tiles', async () => {
    const fileA = new File(['a'], 'a.ply');
    const fileB = new File(['b'], 'b.ply');
    useReconstructionStore.getState().setLoadedFiles(baseLoadedFiles({
      splatFile: fileA,
      splatFiles: [fileA, fileB],
      splatFileSources: [
        { id: 'splats/a.ply', path: 'splats/a.ply', file: fileA },
        { id: 'splats/b.ply', path: 'splats/b.ply', file: fileB },
      ],
    }));
    // A splat is already active; the user has since chosen a non-splat mode.
    usePointCloudStore.setState({ colorMode: 'rgb' });

    await useReconstructionStore.getState().selectSplatSource('splats/b.ply');

    expect(usePointCloudStore.getState().colorMode).toBe('rgb');
  });

  it('merges a remote splat catalog into lazy sources', () => {
    const fileA = new File(['a'], 'a.ply');
    useReconstructionStore.getState().setLoadedFiles(baseLoadedFiles({
      splatFile: fileA,
      splatFiles: [fileA],
      splatFileSources: [{ id: 'splats/a.ply', path: 'splats/a.ply', file: fileA }],
    }));

    useReconstructionStore.getState().mergeRemoteSplatCatalog(
      [{ path: 'splats/a.ply', size: 10 }, { path: 'splats/b.ply', size: 20 }],
      'https://x/ds'
    );

    const sources = useReconstructionStore.getState().loadedFiles?.splatFileSources ?? [];
    expect(sources.map((s) => s.id)).toEqual(['splats/a.ply', 'splats/b.ply']);
    expect(sources.find((s) => s.id === 'splats/a.ply')?.file).toBe(fileA);
    expect(sources.find((s) => s.id === 'splats/b.ply')?.url).toBe('https://x/ds/splats/b.ply');
    expect(sources.find((s) => s.id === 'splats/b.ply')?.file).toBeUndefined();
  });

  it('opens the splat picker when multiple splats are merged with none active', () => {
    useReconstructionStore.getState().setLoadedFiles(baseLoadedFiles({ splatFileSources: [] }));
    expect(useReconstructionStore.getState().showSplatPicker).toBe(false);

    useReconstructionStore.getState().mergeRemoteSplatCatalog(
      [{ path: 'splats/a.ply', size: 10 }, { path: 'splats/b.ply', size: 20 }],
      'https://x/ds'
    );

    expect(useReconstructionStore.getState().showSplatPicker).toBe(true);
    useReconstructionStore.getState().setShowSplatPicker(false);
    expect(useReconstructionStore.getState().showSplatPicker).toBe(false);
  });

  it('opens the splat picker when a lone non-auto-loaded splat is merged with none active', () => {
    useReconstructionStore.getState().setLoadedFiles(baseLoadedFiles({ splatFileSources: [] }));

    useReconstructionStore.getState().mergeRemoteSplatCatalog(
      [{ path: 'splats/huge.ply', size: 1_040_000_634 }],
      'https://x/ds'
    );

    const sources = useReconstructionStore.getState().loadedFiles?.splatFileSources ?? [];
    expect(sources.map((s) => s.path)).toEqual(['splats/huge.ply']);
    expect(useReconstructionStore.getState().showSplatPicker).toBe(true);
  });

  it('does not open the splat picker when the merged lone splat is already active', () => {
    const fileA = new File(['a'], 'a.ply');
    useReconstructionStore.getState().setLoadedFiles(baseLoadedFiles({
      splatFile: fileA,
      splatFiles: [fileA],
      splatFileSources: [{ id: 'splats/a.ply', path: 'splats/a.ply', file: fileA }],
    }));

    useReconstructionStore.getState().mergeRemoteSplatCatalog(
      [{ path: 'splats/a.ply', size: 10 }],
      'https://x/ds'
    );

    expect(useReconstructionStore.getState().showSplatPicker).toBe(false);
  });
});

describe('reconstruction store byte-less oversized splat activation', () => {
  beforeEach(() => {
    useReconstructionStore.setState(useReconstructionStore.getInitialState(), true);
    usePointCloudStore.setState(usePointCloudStore.getInitialState(), true);
    useTransformStore.setState(useTransformStore.getInitialState(), true);
    useUIStore.setState(useUIStore.getInitialState(), true);
    useSplatBackendStore.setState(useSplatBackendStore.getInitialState(), true);
    detectTouchDeviceMock.mockReturnValue(false);
    loadGaussianCloudFromBytesMock.mockReset();
    clearGaussianCloudLoadCacheForTests();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const decodedCloud = { count: 3, shDegree: 0 } as unknown as GaussianCloud;

  function decodedResult() {
    return { file: new File([], ''), format: 'ply' as const, byteLength: 11, cloud: decodedCloud };
  }

  /** Touch hardware with a WebGPU-capable backend: the byte-less gate is open. */
  function armTouchWebGpu() {
    detectTouchDeviceMock.mockReturnValue(true);
    useSplatBackendStore.setState({
      requestedBackend: 'auto',
      availability: { webGpu: 'ready', webGpuFailureReason: null, spark: false },
    });
  }

  // Hand-rolled streaming response (like urlUtils.test.ts): in this test
  // environment `new Response(new Blob([...]))` is not byte-faithful, and the
  // byte-less test asserts the exact bytes handed to the decoder.
  function stubSplatBytesFetch() {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: { get: () => null },
      body: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('splat-bytes'));
          controller.close();
        },
      }),
    }) as unknown as Response));
  }

  function loadOversizedLazySource() {
    useReconstructionStore.getState().setLoadedFiles(baseLoadedFiles({
      splatFileSources: [
        { id: 'splats/big.ply', path: 'splats/big.ply', url: 'https://x/splats/big.ply', size: 150_000_000 },
      ],
    }));
  }

  function getBigSource() {
    return useReconstructionStore.getState().loadedFiles?.splatFileSources
      ?.find((s) => s.id === 'splats/big.ply');
  }

  it('activates an oversized remote splat byte-lessly on touch with WebGPU available', async () => {
    armTouchWebGpu();
    stubSplatBytesFetch();
    loadGaussianCloudFromBytesMock.mockResolvedValue(decodedResult());
    loadOversizedLazySource();
    usePointCloudStore.setState({ colorMode: 'rgb', showSplats: false });

    await useReconstructionStore.getState().selectSplatSource('splats/big.ply');

    const state = useReconstructionStore.getState();
    const splatFile = state.loadedFiles?.splatFile;
    // A zero-byte placeholder named like the source is active; the source keeps
    // no bytes (stays re-fetchable/offloadable).
    expect(splatFile?.name).toBe('big.ply');
    expect(splatFile?.size).toBe(0);
    expect(getBigSource()?.file).toBeUndefined();
    expect(state.requestedSplatSourceId).toBe('splats/big.ply');
    expect(state.urlLoading).toBe(false);
    expect(state.urlProgress).toBeNull();
    expect(state.urlError).toBeNull();
    // Decode ran from the downloaded bytes (no File roundtrip), format from the extension.
    expect(loadGaussianCloudFromBytesMock).toHaveBeenCalledTimes(1);
    const [buffer, format] = loadGaussianCloudFromBytesMock.mock.calls[0] as [ArrayBuffer, string];
    expect(new TextDecoder().decode(new Uint8Array(buffer))).toBe('splat-bytes');
    expect(format).toBe('ply');
    // The decode cache is seeded under the placeholder: the renderer's first
    // loadGaussianCloudFromFile(placeholder) is a guaranteed cache hit whose
    // file identity is the placeholder (not the bytes entry's synthetic file).
    const seeded = await loadGaussianCloudFromFile(splatFile!);
    expect(seeded.cloud).toBe(decodedCloud);
    expect(seeded.file).toBe(splatFile);
    // Fresh activation switches into a splat-visible display mode.
    expect(usePointCloudStore.getState().colorMode).toBe('splatPoints');
  });

  it('keeps the byte-retaining path on desktop for oversized remote splats', async () => {
    // Desktop (detectTouchDevice=false) with a fully capable WebGPU backend.
    useSplatBackendStore.setState({
      requestedBackend: 'auto',
      availability: { webGpu: 'ready', webGpuFailureReason: null, spark: false },
    });
    stubSplatBytesFetch();
    loadOversizedLazySource();

    await useReconstructionStore.getState().selectSplatSource('splats/big.ply');

    const source = getBigSource();
    expect(source?.file).toBeDefined();
    expect(source?.file?.size).toBeGreaterThan(0);
    expect(useReconstructionStore.getState().loadedFiles?.splatFile).toBe(source?.file);
    expect(loadGaussianCloudFromBytesMock).not.toHaveBeenCalled();
  });

  it('keeps the byte-retaining path for small touch splats', async () => {
    armTouchWebGpu();
    stubSplatBytesFetch();
    useReconstructionStore.getState().setLoadedFiles(baseLoadedFiles({
      splatFileSources: [
        // At the touch auto-load budget but under the 100MB retention threshold.
        { id: 'splats/big.ply', path: 'splats/big.ply', url: 'https://x/splats/big.ply', size: 50_000_000 },
      ],
    }));

    await useReconstructionStore.getState().selectSplatSource('splats/big.ply');

    const source = getBigSource();
    expect(source?.file).toBeDefined();
    expect(source?.file?.size).toBeGreaterThan(0);
    expect(loadGaussianCloudFromBytesMock).not.toHaveBeenCalled();
  });

  it('keeps the byte-retaining path on Spark-bound touch devices (requestedBackend spark)', async () => {
    detectTouchDeviceMock.mockReturnValue(true);
    useSplatBackendStore.setState({
      requestedBackend: 'spark',
      availability: { webGpu: 'ready', webGpuFailureReason: null, spark: true },
    });
    stubSplatBytesFetch();
    loadOversizedLazySource();

    await useReconstructionStore.getState().selectSplatSource('splats/big.ply');

    const source = getBigSource();
    // Spark streams splatFile bytes directly; a byte-less placeholder would
    // render empty, so the bytes must be retained.
    expect(source?.file).toBeDefined();
    expect(source?.file?.size).toBeGreaterThan(0);
    expect(loadGaussianCloudFromBytesMock).not.toHaveBeenCalled();
  });

  it('keeps the byte-retaining path on touch without WebGPU support', async () => {
    detectTouchDeviceMock.mockReturnValue(true);
    useSplatBackendStore.setState({
      requestedBackend: 'auto',
      // 'unsupported' auto-resolves to the Spark fallback.
      availability: { webGpu: 'unsupported', webGpuFailureReason: null, spark: true },
    });
    stubSplatBytesFetch();
    loadOversizedLazySource();

    await useReconstructionStore.getState().selectSplatSource('splats/big.ply');

    const source = getBigSource();
    expect(source?.file).toBeDefined();
    expect(source?.file?.size).toBeGreaterThan(0);
    expect(loadGaussianCloudFromBytesMock).not.toHaveBeenCalled();
  });

  it('surfaces a byte-less decode failure like a fetch failure and retries with a fresh placeholder', async () => {
    armTouchWebGpu();
    stubSplatBytesFetch();
    loadGaussianCloudFromBytesMock.mockRejectedValueOnce(new Error('corrupt header'));
    loadOversizedLazySource();

    await useReconstructionStore.getState().selectSplatSource('splats/big.ply');

    let state = useReconstructionStore.getState();
    expect(state.urlLoading).toBe(false);
    expect(state.urlProgress).toBeNull();
    expect(state.urlError?.message).toBe('Failed to load splat');
    expect(state.urlError?.details).toContain('corrupt header');
    // The failed attempt never activated its placeholder.
    expect(state.loadedFiles?.splatFile).toBeUndefined();

    // Retry succeeds: each attempt seeds a FRESH placeholder, so the rejected
    // seed from the failed attempt is unreachable and cannot poison the retry.
    loadGaussianCloudFromBytesMock.mockResolvedValue(decodedResult());
    await useReconstructionStore.getState().selectSplatSource('splats/big.ply');

    state = useReconstructionStore.getState();
    expect(state.loadedFiles?.splatFile?.name).toBe('big.ply');
    const seeded = await loadGaussianCloudFromFile(state.loadedFiles!.splatFile!);
    expect(seeded.cloud).toBe(decodedCloud);
  });
});

describe('abandonUrlAutoLoadRequest', () => {
  beforeEach(() => {
    useReconstructionStore.setState(useReconstructionStore.getInitialState(), true);
  });

  afterEach(() => {
    window.history.replaceState(null, '', '/');
  });

  it('clears the loading UI and strips a legacy ?url= request so the landing page is reachable', () => {
    window.history.replaceState(null, '', '/?url=https://example.com/manifest.json');
    useReconstructionStore.setState({
      urlLoading: true,
      urlProgress: { percent: 0, message: 'Initializing...' },
    });
    expect(hasUrlToLoad()).toBe(true);

    abandonUrlAutoLoadRequest();

    expect(useReconstructionStore.getState().urlLoading).toBe(false);
    expect(useReconstructionStore.getState().urlProgress).toBeNull();
    // hasUrlToLoad() gates the DropZone landing panels; it must now be false.
    expect(hasUrlToLoad()).toBe(false);
  });

  it('strips an inline-manifest hash request (#d=...) while preserving other hash params', () => {
    window.history.replaceState(null, '', '/#d=eyJ4IjoxfQ&foo=bar');
    expect(hasUrlToLoad()).toBe(true);

    abandonUrlAutoLoadRequest();

    expect(hasUrlToLoad()).toBe(false);
    expect(window.location.hash).toContain('foo=bar');
  });
});
